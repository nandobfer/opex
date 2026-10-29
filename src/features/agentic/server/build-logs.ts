import { DomainError } from "@/lib/api/route"
import { dbConnect } from "@/lib/db"
import { AgenticBuild, type IAgenticBuild } from "@/lib/db/models/Agentic"
import { logger } from "@/lib/logger"
import { buildSectionHeader, capBuildLog, type BuildLogLine, type BuildStatus, type WorkbenchBuildDto } from "../build-log"

/**
 * Builds da prévia (aba "Build (N)"): um documento em `agentic_builds` por build da etapa "Subindo a
 * prévia". O app roda o `docker compose … up -d --build` no host e manda cada trecho da saída para
 * `appendBuildOutput`: o log vai ao vivo para quem assiste (`openBuildLogStream`) e é gravado em lote.
 * Estado em `globalThis` (sobrevive ao recarregamento de módulos do `next dev`).
 */

const FLUSH_MS = 1_000
const PING_MS = 15_000

type Listener = (line: BuildLogLine) => void

interface ActiveBuild {
    buildId: string
    workbenchId: string
    log: string
    dropped: number
    commands: string[]
    /** Posição absoluta do começo da saída da execução atual (depois do cabeçalho). */
    sectionStart: number
    timer: ReturnType<typeof setTimeout> | null
    flushing: Promise<void>
    listeners: Set<Listener>
}

interface BuildState {
    active: Map<string, ActiveBuild>
}

const globalBuilds = globalThis as unknown as { __agenticBuilds?: BuildState }
const state: BuildState = (globalBuilds.__agenticBuilds ??= { active: new Map() })

function emit(build: ActiveBuild, line: BuildLogLine): void {
    for (const listener of build.listeners) {
        try {
            listener(line)
        } catch {
            // ouvinte com problema não derruba os demais
        }
    }
}

function scheduleFlush(build: ActiveBuild): void {
    if (build.timer) return
    build.timer = setTimeout(() => void flush(build), FLUSH_MS)
    build.timer.unref?.()
}

function flush(build: ActiveBuild, extra: Partial<Pick<IAgenticBuild, "status" | "endedAt" | "message">> = {}): Promise<void> {
    if (build.timer) clearTimeout(build.timer)
    build.timer = null
    build.flushing = build.flushing.then(async () => {
        try {
            await AgenticBuild.updateOne(
                { _id: build.buildId },
                { $set: { log: build.log, droppedChars: build.dropped, logChars: build.dropped + build.log.length, commands: build.commands, sectionStart: build.sectionStart, ...extra } },
            )
        } catch (error) {
            logger.error({ err: error, workbenchId: build.workbenchId, buildId: build.buildId }, "[agentic] Falha ao gravar o log do build")
        }
    })
    return build.flushing
}

function append(build: ActiveBuild, text: string): void {
    if (!text) return
    const offset = build.dropped + build.log.length
    const capped = capBuildLog(build.log + text, build.dropped)
    build.log = capped.log
    build.dropped = capped.dropped
    emit(build, { type: "append", offset, text })
    scheduleFlush(build)
}

function hydrate(doc: Pick<IAgenticBuild, "_id" | "workbenchId" | "log" | "droppedChars" | "commands" | "sectionStart">): ActiveBuild {
    const log = doc.log ?? ""
    const dropped = doc.droppedChars ?? 0
    return {
        buildId: String(doc._id),
        workbenchId: doc.workbenchId,
        log,
        dropped,
        commands: [...(doc.commands ?? [])],
        sectionStart: doc.sectionStart ?? dropped + log.length,
        timer: null,
        flushing: Promise.resolve(),
        listeners: new Set(),
    }
}

/** Abre um build novo da mesa (o anterior que ainda constasse em andamento vira interrompido). */
export async function startBuild(workbenchId: string, meta: { port: number | null; local: boolean; method: "local" | "github" }): Promise<string> {
    await dbConnect()
    if (state.active.has(workbenchId)) await settleBuild(workbenchId, "interrupted", "Um novo build começou antes do fim deste")
    await AgenticBuild.updateMany({ workbenchId, status: "running" }, { $set: { status: "interrupted", endedAt: new Date() } })
    for (let attempt = 0; ; attempt++) {
        const last = await AgenticBuild.findOne({ workbenchId }).sort({ number: -1 }).select({ number: 1 }).lean()
        try {
            const doc = await AgenticBuild.create({ workbenchId, number: (last?.number ?? 0) + 1, status: "running", startedAt: new Date(), port: meta.port, local: meta.local, method: meta.method })
            state.active.set(workbenchId, hydrate(doc.toObject()))
            return String(doc._id)
        } catch (error) {
            if ((error as { code?: number }).code !== 11000 || attempt >= 2) throw error
        }
    }
}

/** Reconexão a um build em andamento: continua no mesmo documento (o app pode ter reiniciado). */
export async function resumeBuild(workbenchId: string): Promise<void> {
    if (state.active.has(workbenchId)) return
    await dbConnect()
    const doc = await AgenticBuild.findOne({ workbenchId }).sort({ number: -1 }).select({ workbenchId: 1, log: 1, droppedChars: 1, commands: 1, sectionStart: 1, status: 1 }).lean()
    if (!doc) return
    // O build pode ter sido dado como interrompido enquanto o app estava fora: volta a valer.
    if (doc.status !== "running") await AgenticBuild.updateOne({ _id: doc._id }, { $set: { status: "running", endedAt: null, message: null } })
    state.active.set(workbenchId, hydrate(doc))
}

/** Nova execução do comando de build no build atual: cabeçalho com o comando e a hora. */
export function beginBuildSection(workbenchId: string, command: string): void {
    const build = state.active.get(workbenchId)
    if (!build) return
    build.commands.push(command)
    append(build, buildSectionHeader(command, new Date(), build.log.length === 0 && build.dropped === 0))
    build.sectionStart = build.dropped + build.log.length
}

/** Trecho da saída do build (ou uma linha do app, como o código de saída e o aviso de correção). */
export function appendBuildOutput(workbenchId: string, text: string): void {
    const build = state.active.get(workbenchId)
    if (build) append(build, text)
}

/**
 * Retomada da leitura do comando em execução (o app reiniciou no meio): a saída volta a ser lida do
 * começo, então o log volta ao início da execução atual e quem assiste recebe um snapshot novo.
 */
export function restartBuildSection(workbenchId: string): void {
    const build = state.active.get(workbenchId)
    if (!build) return
    const keep = build.sectionStart - build.dropped
    if (keep >= 0 && keep <= build.log.length) build.log = build.log.slice(0, keep)
    else build.log += "\n\x1b[90m…(retomando a leitura da saída)…\x1b[0m\n"
    build.sectionStart = build.dropped + build.log.length
    emit(build, { type: "snapshot", offset: build.dropped, text: build.log, status: "running", message: null })
    scheduleFlush(build)
}

/** Fim do build (status final). Sem build ativo no processo, marca o último em andamento. */
export async function settleBuild(workbenchId: string, status: Exclude<BuildStatus, "running">, message: string | null = null): Promise<void> {
    const build = state.active.get(workbenchId)
    const endedAt = new Date()
    if (!build) {
        await dbConnect()
        await AgenticBuild.updateMany({ workbenchId, status: "running" }, { $set: { status, message, endedAt } })
        return
    }
    state.active.delete(workbenchId)
    await flush(build, { status, message, endedAt })
    emit(build, { type: "status", status, message })
    build.listeners.clear()
}

function toDto(doc: Omit<IAgenticBuild, "log">, status: BuildStatus): WorkbenchBuildDto {
    return {
        id: String(doc._id),
        number: doc.number,
        status,
        startedAt: new Date(doc.startedAt).toISOString(),
        endedAt: doc.endedAt ? new Date(doc.endedAt).toISOString() : null,
        port: doc.port ?? null,
        local: Boolean(doc.local),
        method: doc.method === "github" ? "github" : "local",
        commands: doc.commands ?? [],
        logChars: doc.logChars ?? 0,
        droppedChars: doc.droppedChars ?? 0,
        message: doc.message ?? null,
    }
}

/** Build "em andamento" sem turno neste processo (o app reiniciou no meio): conta como interrompido. */
function effectiveStatus(doc: Pick<IAgenticBuild, "_id" | "workbenchId" | "status">): BuildStatus {
    if (doc.status !== "running") return doc.status
    return state.active.get(doc.workbenchId)?.buildId === String(doc._id) ? "running" : "interrupted"
}

/** Builds da mesa, do primeiro ao último (sem o log). */
export async function listBuilds(workbenchId: string): Promise<WorkbenchBuildDto[]> {
    await dbConnect()
    const docs = await AgenticBuild.find({ workbenchId }).sort({ number: 1 }).select({ log: 0 }).lean()
    const active = state.active.get(workbenchId)
    return docs.map((doc) => {
        const dto = toDto(doc, effectiveStatus(doc))
        // O que ainda não foi gravado já aparece no tamanho.
        return active?.buildId === dto.id ? { ...dto, commands: [...active.commands], logChars: active.dropped + active.log.length, droppedChars: active.dropped } : dto
    })
}

/**
 * Stream NDJSON do log de um build: `snapshot` (tudo até agora), os `append` ao vivo e o `status`
 * final. Build encerrado: `snapshot` e fim.
 */
export async function openBuildLogStream(workbenchId: string, buildId: string, signal: AbortSignal): Promise<Response> {
    await dbConnect()
    const doc = /^[a-f0-9]{24}$/i.test(buildId) ? await AgenticBuild.findOne({ _id: buildId, workbenchId }).lean() : null
    if (!doc) throw new DomainError(404, "Build não encontrado", "BUILD_NOT_FOUND")
    const encoder = new TextEncoder()
    let cleanup = () => {}
    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            let open = true
            const write = (line: BuildLogLine) => {
                if (!open) return
                try {
                    controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`))
                } catch {
                    open = false
                }
            }
            let unsubscribe = () => {}
            const ping = setInterval(() => write({ type: "ping", ts: new Date().toISOString() }), PING_MS)
            ping.unref?.()
            cleanup = () => {
                if (!open) return
                open = false
                clearInterval(ping)
                unsubscribe()
                try {
                    controller.close()
                } catch {
                    // já fechado
                }
            }
            signal.addEventListener("abort", cleanup, { once: true })

            const active = state.active.get(workbenchId)
            if (active?.buildId === buildId) {
                // Em memória e síncrono: o snapshot e a assinatura não perdem nenhum trecho.
                write({ type: "snapshot", offset: active.dropped, text: active.log, status: "running", message: null })
                const listener: Listener = (line) => {
                    write(line)
                    if (line.type === "status") cleanup()
                }
                active.listeners.add(listener)
                unsubscribe = () => active.listeners.delete(listener)
                return
            }
            write({ type: "snapshot", offset: doc.droppedChars ?? 0, text: doc.log ?? "", status: effectiveStatus(doc), message: doc.message ?? null })
            cleanup()
        },
        cancel() {
            cleanup()
        },
    })
    return new Response(stream, {
        headers: {
            "Content-Type": "application/x-ndjson; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
        },
    })
}

/** Esquece os builds da mesa (exclusão). */
export async function dropBuilds(workbenchId: string): Promise<void> {
    const build = state.active.get(workbenchId)
    if (build?.timer) clearTimeout(build.timer)
    state.active.delete(workbenchId)
    await dbConnect()
    await AgenticBuild.deleteMany({ workbenchId })
}
