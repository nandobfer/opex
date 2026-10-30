import { getOpencodeConnection } from "@/lib/ai/opencode"
import { getOpencodeClient } from "@/lib/ai/opencode-client"
import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { AgenticWorkbench } from "@/lib/db/models/Agentic"
import { OpencodeServiceOperation, type IOpencodeServiceOperation } from "@/lib/db/models/OpencodeServiceOperation"
import { TaskRefinement } from "@/lib/db/models/Refinement"
import { loggerFor } from "@/lib/logger"
import { publishAppEvent } from "@/lib/pusher/channels"
import { updateIntegration } from "@/features/integrations/services/integration-service"
import { createHostRunner } from "@/features/local-docker/server/shell"
import { opencodeDebug } from "@/features/opencode-resources/server/host"
import { fetchNpmPackage } from "@/features/opencode-resources/server/versions"
import { detectBinCommand, logsCommand, sanitizeLogs, serviceCommand, servicePidCommand, upgradeCommand, uptimeCommand } from "../commands"
import { OPENCODE_NPM_PACKAGE, OPENCODE_SERVICE_ACTION_LABELS, OPENCODE_SERVICE_AUDIT_ENTITY, OPENCODE_SERVICE_UPDATED_EVENT, SERVICE_ACTION_TIMEOUT_MS, SERVICE_READY_TIMEOUT_MS, type OpencodeServiceAction } from "../constants"
import { portOf, resolveUpgradeTarget, updateInfo, type OpencodeUpdateInfo } from "../logic"
import type { ServiceActionBody } from "../schemas"
import type { OpencodeLogsDto, OpencodeServiceOperationDto, OpencodeServiceStatusDto } from "../types"
import { getSshSettings, isSshConfigured, probeHostFingerprint, runSsh, type SshSettings } from "./ssh"

/**
 * Serviço do OpenCode (aba Controles e Agente Opex) — SOMENTE servidor. Status pela API do OpenCode
 * (no ar) ou por SSH (fora do ar); iniciar, parar, reiniciar e atualizar por SSH, uma operação por vez,
 * persistida em `opencode_service_operations` (a de um processo que morreu vira "interrompida").
 */

const log = loggerFor({ module: "opencode-service" })
const hostRun = createHostRunner(opencodeDebug)

export interface ServiceActor {
    id: string
    origin: "ui" | "opex-agent"
    opexSessionId?: string | null
}

/** Operações em execução NESTE processo (as demais `running` foram interrompidas por um reinício). */
const globalForOps = globalThis as unknown as { opencodeServiceOps?: Set<string> }
const activeOps = (globalForOps.opencodeServiceOps ??= new Set<string>())
const globalForReservation = globalThis as unknown as { opencodeServiceReservation?: { held: boolean } }
const reservation = (globalForReservation.opencodeServiceReservation ??= { held: false })

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export function toOperationDto(op: IOpencodeServiceOperation): OpencodeServiceOperationDto {
    return {
        id: String(op._id),
        action: op.action,
        status: op.status,
        fromVersion: op.fromVersion,
        toVersion: op.toVersion,
        output: op.output,
        error: op.error,
        origin: op.origin,
        startedAt: op.startedAt.toISOString(),
        finishedAt: op.finishedAt?.toISOString() ?? null,
    }
}

/** Marca como interrompidas as operações `running` que não pertencem a este processo. */
async function reconcile(): Promise<void> {
    const running = await OpencodeServiceOperation.find({ status: "running" }).select({ _id: 1 }).lean()
    const orphans = running.map((op) => op._id).filter((id) => !activeOps.has(String(id)))
    if (orphans.length) await OpencodeServiceOperation.updateMany({ _id: { $in: orphans } }, { $set: { status: "interrupted", error: "Interrompida: o Opex reiniciou durante a operação", finishedAt: new Date() } })
}

export async function getLatestOperation(): Promise<OpencodeServiceOperationDto | null> {
    await dbConnect()
    await reconcile()
    const op = await OpencodeServiceOperation.findOne({}).sort({ startedAt: -1 }).lean<IOpencodeServiceOperation>()
    return op ? toOperationDto(op) : null
}

export async function getOperation(id: string): Promise<OpencodeServiceOperationDto> {
    await dbConnect()
    await reconcile()
    const op = /^[a-f0-9]{24}$/i.test(id) ? await OpencodeServiceOperation.findById(id).lean<IOpencodeServiceOperation>() : null
    if (!op) throw new DomainError(404, "Operação não encontrada", "OPENCODE_OPERATION_NOT_FOUND")
    return toOperationDto(op)
}

/** Mesas e refinamentos com turno rodando agora (interrompidos por parar/reiniciar/atualizar). */
export async function getServiceImpact(): Promise<{ workbenches: number; refinements: number }> {
    await dbConnect()
    const [workbenches, refinements] = await Promise.all([AgenticWorkbench.countDocuments({ runState: "running" }), TaskRefinement.countDocuments({ runState: "running" })])
    return { workbenches, refinements }
}

interface ServerInfo {
    version: string
    pid: number
    urls: string[]
}

async function serverInfo(timeoutMs = 5_000): Promise<{ info: ServerInfo | null; reason: string | null; baseUrl: string | null }> {
    let baseUrl: string | null = null
    try {
        const connection = await getOpencodeConnection()
        baseUrl = connection.baseUrl
        const client = await getOpencodeClient(connection)
        const info = await client.server.info({ signal: AbortSignal.timeout(timeoutMs) })
        return { info: { version: info.version, pid: info.pid, urls: info.urls }, reason: null, baseUrl }
    } catch (error) {
        return { info: null, reason: error instanceof Error ? error.message : String(error), baseUrl }
    }
}

async function availableUpdate(current: string | null): Promise<OpencodeUpdateInfo | null> {
    const pkg = await fetchNpmPackage(OPENCODE_NPM_PACKAGE)
    return pkg ? updateInfo(current, pkg.versions) : null
}

/** Executável do opencode: o configurado ou o do PATH do processo do OpenCode (gravado na integração). */
async function resolveBin(settings: SshSettings, actorId: string): Promise<string | null> {
    if (settings.bin) return settings.bin
    const result = await hostRun(detectBinCommand(), 10_000, { quiet: true }).catch(() => null)
    const bin = result?.exitCode === 0 ? result.output.trim().split("\n").at(-1)?.trim() : null
    if (!bin?.startsWith("/")) return null
    await updateIntegration("ai_opencode", { publicValues: { opencodeBin: bin } }, actorId).catch((error: unknown) => log.warn({ err: error }, "[opencode-service] Não foi possível gravar o executável detectado"))
    return bin
}

export async function getServiceStatus(): Promise<OpencodeServiceStatusDto> {
    const [settings, { info, reason, baseUrl }] = await Promise.all([getSshSettings(), serverInfo()])
    const configured = isSshConfigured(settings)
    const trusted = configured && Boolean(settings.fingerprint)
    let state: OpencodeServiceStatusDto["state"] = info ? "running" : "unknown"
    let uptimeSeconds: number | null = null
    let pid = info?.pid ?? null
    let stateReason = reason
    if (info) {
        const uptime = await hostRun(uptimeCommand(info.pid), 10_000, { quiet: true }).catch(() => null)
        const seconds = uptime?.exitCode === 0 ? Number.parseInt(uptime.output.trim(), 10) : NaN
        uptimeSeconds = Number.isFinite(seconds) ? seconds : null
        if (!settings.bin) void resolveBin(settings, "local").catch(() => undefined)
    } else if (trusted) {
        const probe = await runSsh(servicePidCommand(), 15_000, { quiet: true, settings }).catch((error: unknown) => {
            stateReason = error instanceof Error ? error.message : String(error)
            return null
        })
        if (probe) {
            const found = Number.parseInt(probe.output.trim(), 10)
            if (Number.isFinite(found)) {
                state = "unreachable"
                pid = found
            } else state = "stopped"
        }
    }
    const [update, operation, impact] = await Promise.all([availableUpdate(info?.version ?? null), getLatestOperation(), getServiceImpact()])
    return {
        state,
        reason: state === "running" ? null : stateReason,
        baseUrl,
        version: info?.version ?? null,
        pid,
        port: portOf(info?.urls[0]) ?? portOf(baseUrl),
        uptimeSeconds,
        ssh: { configured, trusted, host: settings.host, port: settings.port, user: settings.username, fingerprint: settings.fingerprint, bin: settings.bin },
        update,
        operation,
        impact,
        checkedAt: new Date().toISOString(),
    }
}

export async function getServiceLogs(lines: number): Promise<OpencodeLogsDto> {
    const settings = await getSshSettings()
    if (isSshConfigured(settings) && settings.fingerprint) {
        const result = await runSsh(logsCommand(lines), 20_000, { quiet: true, settings })
        return { lines: sanitizeLogs(result.output), source: "ssh" }
    }
    const result = await hostRun(logsCommand(lines), 20_000, { quiet: true, retryOnLost: true }).catch((error: unknown) => {
        throw new DomainError(502, `Não foi possível ler os logs: ${error instanceof Error ? error.message : String(error)}. Configure o acesso SSH para ler com o serviço parado`, "OPENCODE_LOGS_UNAVAILABLE")
    })
    return { lines: sanitizeLogs(result.output), source: "opencode" }
}

/** Lê a impressão digital atual do host (sem confiar ainda). */
export async function readHostFingerprint(): Promise<{ fingerprint: string; trusted: string | null }> {
    const settings = await getSshSettings()
    return { fingerprint: await probeHostFingerprint(settings), trusted: settings.fingerprint }
}

/** Confia na chave do host: só grava se for a mesma que o host apresenta agora. */
export async function trustHostKey(fingerprint: string, actor: ServiceActor): Promise<{ fingerprint: string }> {
    const settings = await getSshSettings()
    const current = await probeHostFingerprint(settings)
    if (current !== fingerprint) throw new DomainError(409, `A chave apresentada pelo host agora (${current}) é diferente da confirmada: confira e tente de novo`, "OPENCODE_SSH_HOST_KEY_MISMATCH")
    await updateIntegration("ai_opencode", { publicValues: { sshHostFingerprint: fingerprint } }, actor.id)
    await recordAudit({ userId: actor.id, entidade: OPENCODE_SERVICE_AUDIT_ENTITY, entidadeId: "ssh", acao: AcaoAuditoria.ATUALIZAR, antes: { impressaoDigital: settings.fingerprint }, depois: { impressaoDigital: fingerprint, host: settings.host, origem: actor.origin } })
    await publishAppEvent(OPENCODE_SERVICE_UPDATED_EVENT, { status: "ssh" })
    return { fingerprint }
}

async function waitReady(expectRunning: boolean): Promise<boolean> {
    const deadline = Date.now() + SERVICE_READY_TIMEOUT_MS
    while (Date.now() < deadline) {
        const { info } = await serverInfo(3_000)
        if (Boolean(info) === expectRunning) return true
        await sleep(1_500)
    }
    return false
}

async function finish(op: IOpencodeServiceOperation, patch: Partial<IOpencodeServiceOperation>): Promise<OpencodeServiceOperationDto> {
    const updated = await OpencodeServiceOperation.findByIdAndUpdate(op._id, { $set: { ...patch, finishedAt: new Date() } }, { new: true }).lean<IOpencodeServiceOperation>()
    activeOps.delete(String(op._id))
    const dto = toOperationDto(updated ?? { ...op, ...patch, finishedAt: new Date() })
    log.info({ action: op.action, status: dto.status }, "[opencode-service] Operação concluída")
    await publishAppEvent(OPENCODE_SERVICE_UPDATED_EVENT, { status: dto.status })
    if (op.opexSessionId && op.action === "upgrade") {
        const { notifyOpexServiceOperation } = await import("./opex-notice")
        await notifyOpexServiceOperation(op.opexSessionId, dto).catch((error: unknown) => log.warn({ err: error }, "[opencode-service] Falha ao avisar o Agente Opex"))
    }
    return dto
}

async function execute(op: IOpencodeServiceOperation, command: string, settings: SshSettings): Promise<OpencodeServiceOperationDto> {
    try {
        const result = await runSsh(command, SERVICE_ACTION_TIMEOUT_MS[op.action], { settings })
        const output = sanitizeLogs(result.output).slice(-4_000)
        if (result.exitCode !== 0) return finish(op, { status: "failed", output, error: `${OPENCODE_SERVICE_ACTION_LABELS[op.action].verb} falhou (código ${result.exitCode ?? "?"})${output ? `: ${output.split("\n").at(-1)}` : ""}` })
        const ready = await waitReady(op.action !== "stop")
        if (!ready) return finish(op, { status: "failed", output, error: op.action === "stop" ? "O serviço ainda responde depois de parar" : "O comando terminou, mas a API do OpenCode não voltou a responder" })
        let toVersion = op.toVersion
        if (op.action !== "stop") toVersion = (await serverInfo()).info?.version ?? toVersion
        return finish(op, { status: "succeeded", output, toVersion })
    } catch (error) {
        return finish(op, { status: "failed", error: error instanceof Error ? error.message : String(error) })
    }
}

/**
 * Iniciar, parar, reiniciar ou atualizar por SSH. Uma por vez (409). Atualizar roda em segundo plano e
 * devolve a operação `running`; as demais esperam terminar.
 */
export async function runServiceAction(action: OpencodeServiceAction, body: ServiceActionBody, actor: ServiceActor): Promise<OpencodeServiceOperationDto> {
    // Reserva síncrona (antes do primeiro await): duas chamadas simultâneas (duplo clique, tela +
    // agente) não passam juntas pela conferência. Depois da criação, o documento `running` segura a vaga.
    if (reservation.held) throw new DomainError(409, "Já há uma operação do serviço em andamento: aguarde terminar", "OPENCODE_OPERATION_RUNNING")
    reservation.held = true
    try {
        return await startServiceAction(action, body, actor)
    } finally {
        reservation.held = false
    }
}

async function startServiceAction(action: OpencodeServiceAction, body: ServiceActionBody, actor: ServiceActor): Promise<OpencodeServiceOperationDto> {
    const settings = await getSshSettings()
    if (!isSshConfigured(settings)) throw new DomainError(409, "Acesso SSH ao host do OpenCode não configurado: preencha host, usuário e chave privada na aba Configuração", "OPENCODE_SSH_NOT_CONFIGURED")
    if (!settings.fingerprint) throw new DomainError(409, "Confie na chave do host SSH antes (aba Controles › Acesso SSH)", "OPENCODE_SSH_UNTRUSTED")
    await dbConnect()
    await reconcile()
    if (await OpencodeServiceOperation.exists({ status: "running" })) throw new DomainError(409, "Já há uma operação do serviço em andamento: aguarde terminar", "OPENCODE_OPERATION_RUNNING")
    const bin = await resolveBin(settings, actor.id)
    if (!bin) throw new DomainError(409, "Não foi possível descobrir o executável do opencode no host: informe o caminho em Configuração › Executável do opencode", "OPENCODE_BIN_UNKNOWN")
    const current = (await serverInfo()).info?.version ?? null
    let command: string
    let toVersion: string | null = null
    if (action === "upgrade") {
        const pkg = await fetchNpmPackage(OPENCODE_NPM_PACKAGE, true)
        if (!pkg) throw new DomainError(502, "Não foi possível consultar as versões do OpenCode no npm", "OPENCODE_VERSIONS_UNAVAILABLE")
        const target = resolveUpgradeTarget(updateInfo(current, pkg.versions), body.version, body.allowMajor === true)
        if ("error" in target) throw new DomainError(409, target.error, "OPENCODE_UPGRADE_REFUSED")
        toVersion = target.version
        command = upgradeCommand(bin, target.version)
    } else command = serviceCommand(bin, action)
    const op = (
        await OpencodeServiceOperation.create({ action, status: "running", fromVersion: current, toVersion, output: "", error: null, origin: actor.origin, opexSessionId: actor.opexSessionId ?? null, createdBy: actor.id, startedAt: new Date(), finishedAt: null })
    ).toObject() as IOpencodeServiceOperation
    activeOps.add(String(op._id))
    await recordAudit({ userId: actor.id, entidade: OPENCODE_SERVICE_AUDIT_ENTITY, entidadeId: String(op._id), acao: AcaoAuditoria.EXECUTAR, depois: { acao: action, versaoAtual: current, versaoAlvo: toVersion, origem: actor.origin } })
    await publishAppEvent(OPENCODE_SERVICE_UPDATED_EVENT, { status: "running" })
    if (action === "upgrade") {
        void execute(op, command, settings)
        return toOperationDto(op)
    }
    return execute(op, command, settings)
}
