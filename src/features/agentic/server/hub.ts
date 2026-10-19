import { dbConnect } from "@/lib/db"
import { AgenticEvent } from "@/lib/db/models/Agentic"
import { logger } from "@/lib/logger"
import type { WorkbenchEvent, WorkbenchEventPayload } from "../types"

/**
 * Barramento em memória da saída das mesas (um processo Node). Cada evento recebe um `seq`
 * crescente por mesa, vai na hora para quem está assistindo e é gravado em lote em
 * `agentic_events` — textos consecutivos viram um único documento. Eventos transitórios
 * (raciocínio, progresso de ferramenta) só vão ao vivo.
 *
 * Fica em `globalThis` para sobreviver ao recarregamento de módulos do `next dev`.
 */

const FLUSH_MS = 400
/** Saída de ferramenta gravada (o resto vai só ao vivo). */
export const MAX_TOOL_OUTPUT = 20_000

type Listener = (event: WorkbenchEvent) => void

interface HubState {
    seqs: Map<string, number>
    buffers: Map<string, WorkbenchEvent[]>
    timers: Map<string, ReturnType<typeof setTimeout>>
    flushing: Map<string, Promise<void>>
    listeners: Map<string, Set<Listener>>
    /** Mesas com turno em andamento neste processo. */
    active: Map<string, AbortController>
}

const globalHub = globalThis as unknown as { __agenticHub?: HubState }
const hub: HubState = (globalHub.__agenticHub ??= {
    seqs: new Map(),
    buffers: new Map(),
    timers: new Map(),
    flushing: new Map(),
    listeners: new Map(),
    active: new Map(),
})

const TRANSIENT = new Set<WorkbenchEventPayload["type"]>(["reasoning", "tool-progress", "pr-watch-step"])

function clip(value: string | null | undefined, max = MAX_TOOL_OUTPUT): string | null | undefined {
    if (typeof value !== "string" || value.length <= max) return value
    return `…(${(value.length - max).toLocaleString("pt-BR")} caracteres omitidos)\n${value.slice(-max)}`
}

/** Carrega o último `seq` gravado (uma vez por mesa e processo). */
export async function prepareHub(workbenchId: string): Promise<void> {
    if (hub.seqs.has(workbenchId)) return
    await dbConnect()
    const last = await AgenticEvent.findOne({ workbenchId }).sort({ seq: -1 }).select({ seq: 1 }).lean()
    if (!hub.seqs.has(workbenchId)) hub.seqs.set(workbenchId, last?.seq ?? 0)
}

/** Publica um evento (exige `prepareHub` antes). */
export function publishWorkbenchEvent(workbenchId: string, payload: WorkbenchEventPayload): WorkbenchEvent {
    const ts = new Date().toISOString()
    if (TRANSIENT.has(payload.type)) {
        const event: WorkbenchEvent = { ...payload, ts }
        emit(workbenchId, event)
        return event
    }
    const stored = payload.type === "tool" ? { ...payload, output: clip(payload.output), input: clip(payload.input, 2000) } : payload
    const seq = (hub.seqs.get(workbenchId) ?? 0) + 1
    hub.seqs.set(workbenchId, seq)
    const event = { ...stored, seq, ts } as WorkbenchEvent
    const buffer = hub.buffers.get(workbenchId) ?? []
    buffer.push(event)
    hub.buffers.set(workbenchId, buffer)
    if (!hub.timers.has(workbenchId)) {
        const timer = setTimeout(() => void flushWorkbenchEvents(workbenchId), FLUSH_MS)
        timer.unref?.()
        hub.timers.set(workbenchId, timer)
    }
    emit(workbenchId, event)
    return event
}

function emit(workbenchId: string, event: WorkbenchEvent): void {
    for (const listener of hub.listeners.get(workbenchId) ?? []) {
        try {
            listener(event)
        } catch {
            // ouvinte com problema não derruba os demais
        }
    }
}

/** Junta textos consecutivos num documento só (o `seq` do documento é o do último pedaço). */
export function coalesceEvents(events: WorkbenchEvent[]): WorkbenchEvent[] {
    const result: WorkbenchEvent[] = []
    for (const event of events) {
        const previous = result.at(-1)
        if (event.type === "text" && previous?.type === "text") {
            result[result.length - 1] = { ...previous, text: previous.text + event.text, seq: event.seq }
            continue
        }
        result.push(event)
    }
    return result
}

/** Grava o que está pendente (encadeado: um lote por vez, na ordem). */
export function flushWorkbenchEvents(workbenchId: string): Promise<void> {
    const timer = hub.timers.get(workbenchId)
    if (timer) clearTimeout(timer)
    hub.timers.delete(workbenchId)
    const previous = hub.flushing.get(workbenchId) ?? Promise.resolve()
    const next = previous.then(async () => {
        const events = hub.buffers.get(workbenchId) ?? []
        hub.buffers.delete(workbenchId)
        if (!events.length) return
        try {
            await dbConnect()
            await AgenticEvent.insertMany(
                coalesceEvents(events).map(({ seq, ts, ...payload }) => ({ workbenchId, seq, ts: new Date(ts), payload })),
                { ordered: false },
            )
        } catch (error) {
            logger.error({ err: error, workbenchId }, "[agentic] Falha ao gravar a saída da mesa")
        }
    })
    hub.flushing.set(workbenchId, next)
    void next.finally(() => {
        if (hub.flushing.get(workbenchId) === next) hub.flushing.delete(workbenchId)
    })
    return next
}

/**
 * Verificação do PR sem novidade: apaga as verificações sem novidade já gravadas da mesa, para que
 * fique só a última (as que encontraram algo são mantidas).
 */
export async function dropIdlePrWatchEvents(workbenchId: string): Promise<void> {
    await flushWorkbenchEvents(workbenchId)
    await dbConnect()
    await AgenticEvent.deleteMany({ workbenchId, "payload.type": "pr-watch", "payload.outcome": "idle" })
}

export function subscribeWorkbench(workbenchId: string, listener: Listener): () => void {
    const set = hub.listeners.get(workbenchId) ?? new Set()
    set.add(listener)
    hub.listeners.set(workbenchId, set)
    return () => {
        set.delete(listener)
        if (!set.size) hub.listeners.delete(workbenchId)
    }
}

/** Eventos gravados da mesa, em ordem (a tela reconstrói a saída a partir deles). */
export async function listWorkbenchEvents(workbenchId: string): Promise<WorkbenchEvent[]> {
    await dbConnect()
    const docs = await AgenticEvent.find({ workbenchId }).sort({ seq: 1 }).lean()
    return docs.map((doc) => ({ ...(doc.payload as WorkbenchEventPayload), seq: doc.seq, ts: new Date(doc.ts).toISOString() }) as WorkbenchEvent)
}

export function markWorkbenchActive(workbenchId: string, controller: AbortController): void {
    hub.active.set(workbenchId, controller)
}

export function clearWorkbenchActive(workbenchId: string, controller: AbortController): void {
    if (hub.active.get(workbenchId) === controller) hub.active.delete(workbenchId)
}

export const isWorkbenchActive = (workbenchId: string) => hub.active.has(workbenchId)

export function abortWorkbenchRun(workbenchId: string, reason: string): void {
    hub.active.get(workbenchId)?.abort(new Error(reason))
}

/** Esquece a mesa (exclusão). */
export async function dropWorkbenchEvents(workbenchId: string): Promise<void> {
    await flushWorkbenchEvents(workbenchId)
    hub.seqs.delete(workbenchId)
    await AgenticEvent.deleteMany({ workbenchId })
}
