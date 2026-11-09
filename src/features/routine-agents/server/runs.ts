import { isInvalidRoutineOpexProvider, ROUTINE_ENGINE_PROVIDER_INVALID_MESSAGE } from "../schemas"
import { guardedRoutineTool } from "./tools/guarded"
import { HTTP_REQUEST_TOOL, httpTools } from "@/features/opex-agent/server/tools/http"
import { loadRoutineSecretVault } from "./secrets"
import { routineAgentTitle } from "../identity-plan"
import { randomUUID } from "node:crypto"
import { Types } from "mongoose"
import { DomainError } from "@/lib/api/route"
import { encryptSecret } from "@/lib/crypto/secretBox"
import { recordAiConsumption } from "@/lib/ai/consumption"
import { routineIdentityOf } from "@/features/ai/agents"
import { RoutineAgent, RoutineRun, type IRoutineRun } from "@/lib/db/models/RoutineAgent"
import { LIVE_WAIT_OVERFLOW_HIBERNATE_MINUTES, ROUTINE_CONSUMPTION_ORIGIN, routineChannelOf } from "../constants"
import { ACTIVE_LIMIT_MESSAGE, ROUTINE_STOP_GRACE_MS, ROUTINE_TURN_TIMEOUT_MS, TOKEN_LIMIT_MESSAGE, TURN_TIMEOUT_MESSAGE, remainingActiveMs } from "../limits"
import { activationMessage, routineInstructions } from "../run-prompt"
import { freeSlots } from "../slots"
import { ROUTINE_SLOT_STATUSES, isFinalRunStatus, type RoutineRunStatus, type RoutineTriggerOrigin } from "../status"
import { activeRoutineChannels, baseRoutineChannels, routineAgentTarget } from "./engramind"
import { addUsage, beginActivation, endActivation, stopActivation, type Activation } from "./hub"
import { ensureHeartbeat } from "./heartbeat"
import { INSTANCE_ID } from "@/lib/instance"
import { forgetRunStepThrottle, pruneRunSteps, recordRunStep } from "./steps"
import { routineControlTools } from "./tools/internal"
import { routineMemoryTools } from "./tools/memory"
import type { EngineInput, EngineResult } from "./engines/types"
import {
    AcaoAuditoria,
    auditRun,
    emitRunChange,
    loadAgentDoc,
    messageOf,
    notFoundRun,
    publishAgentUpdated,
    publishRunAttention,
    routineDb,
    routineLog,
    type RoutineAgentDoc,
    type RoutineRunDoc,
} from "./shared"

/**
 * Execuções dos agentes rotineiros (OPE-130): disparo, fila (FIFO, só Executando/Esperando ocupam
 * vaga), ativação no motor, e o fecho de cada turno (concluir, hibernar, aguardar confirmação, erro).
 * Cada execução e cada retomada recebem o contexto do Engramind lido com o **token do agente**.
 *
 * Cada turno grava o id da ativação (`activationId`), a instância e o batimento (OPE-147): só a
 * ativação dona grava a fase e o fecho, então uma instância que volta depois de travada não conclui
 * por cima de uma execução já retomada noutra.
 */

/** Nota da retomada depois de um turno interrompido (sem batimento: deploy, container parado). */
export const INTERRUPTED_RESUME_NOTE =
    "(O turno anterior desta execução foi interrompido: o servidor reiniciou ou a instância parou de responder. Retome do último ponto salvo e confira o estado antes de repetir uma ação que possa já ter sido feita.)"

export interface TriggerInput {
    origin: RoutineTriggerOrigin
    triggerId?: string | null
    request?: string | null
    payload?: unknown
    delayMs?: number | null
}

const locks = ((globalThis as unknown as { __routineAgentLocks?: Map<string, Promise<unknown>> }).__routineAgentLocks ??= new Map())

/** Serializa as decisões de vaga de um agente (sem corrida entre disparo, fim de turno e tick). */
async function withAgentLock<T>(agentId: string, fn: () => Promise<T>): Promise<T> {
    const previous = locks.get(agentId) ?? Promise.resolve()
    const next = previous.catch(() => undefined).then(fn)
    locks.set(agentId, next)
    try {
        return await next
    } finally {
        if (locks.get(agentId) === next) locks.delete(agentId)
    }
}

const PAUSED = () => new DomainError(409, "O agente rotineiro está pausado ou arquivado: retome-o para disparar execuções", "ROUTINE_AGENT_PAUSED")
const NOT_PROVISIONED = () => new DomainError(409, "O agente rotineiro ainda não foi provisionado (ou o provisionamento falhou): use \"Tentar de novo\" na configuração", "ROUTINE_AGENT_NOT_PROVISIONED")

/** Confere se o agente pode disparar (ativo e provisionado). */
export function assertRunnable(agent: RoutineAgentDoc): void {
    if (agent.status !== "active") throw PAUSED()
    if (agent.provisioning?.status !== "ok") throw NOT_PROVISIONED()
    if (isInvalidRoutineOpexProvider(agent.engine, agent.opex?.provider)) throw new DomainError(409, ROUTINE_ENGINE_PROVIDER_INVALID_MESSAGE, "ROUTINE_ENGINE_PROVIDER_INVALID")
}

export async function triggerRoutineRun(agentId: string, input: TriggerInput, actorId: string): Promise<{ runId: string; status: RoutineRunStatus }> {
    const agent = await loadAgentDoc(agentId)
    assertRunnable(agent)
    const counter = await RoutineAgent.findOneAndUpdate({ _id: agent._id }, { $inc: { runSeq: 1 }, $set: { lastRunAt: new Date() } }, { new: true }).lean()
    const now = new Date()
    const created = await RoutineRun.create({
        agentId: agent._id,
        seq: counter?.runSeq ?? 1,
        origin: input.origin,
        triggerId: input.triggerId ?? null,
        request: input.request?.trim() || null,
        payload: input.payload ?? null,
        status: "queued",
        snapshot: { engine: agent.engine, opex: agent.opex, opencode: agent.opencode, confirmIrreversible: agent.confirmIrreversible !== false, limits: agent.limits },
        queuedAt: now,
        delayMs: input.delayMs ?? null,
    })
    const runId = String(created._id)
    await auditRun(actorId, runId, AcaoAuditoria.EXECUTAR, { evento: "disparar", agente: agentId, origem: input.origin, gatilho: input.triggerId ?? null, atrasoMs: input.delayMs ?? null })
    await emitRunChange(created, "queued")
    await pumpAgent(agentId)
    const fresh = await RoutineRun.findById(runId).select({ status: 1 }).lean()
    await publishAgentUpdated(agentId)
    return { runId, status: fresh?.status ?? "queued" }
}

/** Anda a fila do agente: inicia as execuções na fila enquanto houver vaga (ordem de chegada). */
export async function pumpAgent(agentId: string): Promise<void> {
    await withAgentLock(agentId, async () => {
        await routineDb()
        const agent = await RoutineAgent.findById(agentId).select({ limits: 1 }).lean()
        if (!agent) return
        const occupied = await RoutineRun.countDocuments({ agentId: agent._id, status: { $in: ROUTINE_SLOT_STATUSES } })
        const queued = await RoutineRun.find({ agentId: agent._id, status: "queued" }).sort({ queuedAt: 1, _id: 1 }).limit(50).lean<RoutineRunDoc[]>()
        const slots = freeSlots(agent.limits?.concurrency ?? null, occupied, queued.length)
        for (const candidate of queued.slice(0, slots)) {
            const now = new Date()
            const claimed = await RoutineRun.findOneAndUpdate(
                { _id: candidate._id, status: "queued" },
                { $set: { status: "running", activationStartedAt: now, startedAt: candidate.startedAt ?? now, activationId: randomUUID(), instance: INSTANCE_ID, heartbeatAt: now } },
                { new: true },
            ).lean<RoutineRunDoc | null>()
            if (!claimed) continue
            launch(claimed)
        }
    })
}

function launch(run: RoutineRunDoc): void {
    const activation = beginActivation({ runId: String(run._id), agentId: String(run.agentId), activationId: run.activationId ?? undefined, baseTokens: run.tokens ?? 0, baseActiveMs: run.activeMs ?? 0 })
    ensureHeartbeat()
    void emitRunChange(run, "running").catch(() => undefined)
    void executeActivation(run, activation).catch((error: unknown) => {
        routineLog.error({ runId: String(run._id), err: messageOf(error) }, "[routine-agents] falha ao fechar a ativação")
        endActivation(String(run._id))
    })
}

async function setPhase(run: RoutineRunDoc, phase: "running" | "waiting"): Promise<void> {
    const updated = await RoutineRun.updateOne({ _id: run._id, status: { $in: ROUTINE_SLOT_STATUSES }, activationId: run.activationId ?? null }, { $set: { status: phase } })
    if (updated.modifiedCount) await emitRunChange(run, phase)
}

async function executeActivation(run: RoutineRunDoc, activation: Activation): Promise<void> {
    const runId = String(run._id)
    let result: EngineResult = { error: null, text: "" }
    let timer: ReturnType<typeof setTimeout> | null = null
    try {
        const agent = await loadAgentDoc(String(run.agentId))
        const target = await routineAgentTarget(agent.engramindToken).catch(() => null)
        if (!target) throw new Error("Token do agente rotineiro indisponível no Engramind: use \"Reprovisionar\" na configuração do agente")
        const subscribed = [...baseRoutineChannels(agent.slug), ...(agent.provisioning?.extras ?? []).map((item) => item.channel)]
        // Canal arquivado no Engramind depois do provisionamento sai do contexto e da lista de memória (D13).
        const channels = await activeRoutineChannels(subscribed, target).then(
            ({ active, archived }) => {
                if (archived.length) activation.warnings.push(`Canal arquivado no Engramind, fora desta execução: ${archived.join(", ")}. Restaure-o na rede ou use "Reprovisionar".`)
                return active
            },
            (error: unknown) => {
                // Sem a lista, segue com os assinados: o Engramind continua recusando escrita em canal arquivado.
                routineLog.warn({ err: error, runId }, "[routine-agents] não foi possível conferir os canais arquivados")
                return subscribed
            },
        )
        // Canais em que as ferramentas de memória leem e gravam (D13): o próprio primeiro.
        const memoryChannels = [routineChannelOf(agent.slug), ...channels.filter((channel) => channel !== routineChannelOf(agent.slug))]
        const { getAgentMemoryContext } = await import("@/features/engramind/server/memory-context")
        const memory = await getAgentMemoryContext(routineIdentityOf(agent.slug), channels, { target, focus: [agent.objective, run.request ?? ""].join("\n").slice(0, 1_000) })
        if (memory.source === "none" && memory.reason) throw new Error(`Engramind indisponível (${memory.reason}). Confira a integração Engramind e dispare de novo.`)
        if (memory.source === "cache") activation.warnings.push("Engramind indisponível: a execução usou o último contexto de memórias em cache.")
        const resume = Boolean(run.resumeNote) || (run.activeMs ?? 0) > 0
        if (resume) recordRunStep(run, { kind: "resume", label: "Retomada", detail: run.resumeNote?.slice(0, 400) ?? null, toolName: null, durationMs: null, error: false })
        const label = `${routineAgentTitle(agent.name)} #${run.seq}`
        // Segredos (aba Segredos): lidos agora, então uma edição vale já nesta ativação. Só os nomes vão ao modelo.
        const httpEnabled = run.snapshot.engine === "opex" ? (run.snapshot.opex?.enabledTools ?? []).includes(HTTP_REQUEST_TOOL) : run.snapshot.opencode?.httpRequests === true
        activation.secrets = await loadRoutineSecretVault(agent._id)
        // Motor OpenCode: a Chamada HTTP do MCP da execução segue a política do dono no Agente Opex
        // (ferramenta desligada fica de fora; "pede confirmação" vira Aguardando confirmação), como no motor Opex.
        let opencodeHttp: typeof httpTools = []
        if (run.snapshot.engine === "opencode" && httpEnabled) {
            const { loadOpexSettings } = await import("@/features/opex-agent/server/settings")
            const { settings } = await loadOpexSettings()
            if (settings.disabledTools.includes(HTTP_REQUEST_TOOL)) activation.warnings.push('A ferramenta "Chamada HTTP" está desligada no Agente Opex: a execução segue sem ela.')
            else opencodeHttp = httpTools.map((tool) => guardedRoutineTool(tool, { activation, confirmIrreversible: run.snapshot.confirmIrreversible, overrides: settings.confirmationOverrides }))
        }
        const secretCatalog = httpEnabled && (run.snapshot.engine === "opex" || opencodeHttp.length) ? activation.secrets.list() : []
        const internalTools = [
            ...routineControlTools({ activation, limits: run.snapshot.limits, confirmIrreversible: run.snapshot.confirmIrreversible, setPhase: (phase) => setPhase(run, phase) }),
            ...routineMemoryTools({ slug: agent.slug, label, target, runId, allowed: memoryChannels, warn: (message) => activation.warnings.push(message) }),
            // Motor OpenCode: a Chamada HTTP com segredos sai do servidor Opex, pelo MCP da execução.
            ...opencodeHttp,
        ]
        activation.tools = internalTools
        const remaining = remainingActiveMs({ activeMs: run.activeMs ?? 0 }, run.snapshot.limits)
        // Sem "Tempo máximo ativo" (ou com um maior que o teto), vale o teto técnico do turno.
        timer =
            remaining !== null && remaining <= ROUTINE_TURN_TIMEOUT_MS
                ? setTimeout(() => stopActivation(runId, "active"), Math.max(1_000, remaining))
                : setTimeout(() => stopActivation(runId, "turn_timeout"), ROUTINE_TURN_TIMEOUT_MS)
        let activationStep = 0
        const messageInput = { origin: run.origin, request: run.request, payload: run.payload, delayMs: run.delayMs, resumeNote: run.resumeNote }
        // Turno interrompido antes de salvar o histórico (motor Opex sem `messages`, OpenCode sem sessão):
        // a retomada leva também a mensagem do disparo, senão o modelo perde a solicitação.
        const noHistory = run.snapshot.engine === "opex" ? !run.messages : !run.opencodeSessionId
        const message =
            resume && noHistory && (run.interruptions ?? 0) > 0
                ? [activationMessage({ kind: "start", ...messageInput }), "", activationMessage({ kind: "resume", ...messageInput })].join("\n")
                : activationMessage({ kind: resume ? "resume" : "start", ...messageInput })
        const input: EngineInput = {
            agent,
            run,
            activation,
            message,
            instructions: (toolPrefix) =>
                routineInstructions({
                    name: routineAgentTitle(agent.name),
                    objective: agent.objective,
                    instructions: agent.instructions ?? "",
                    engine: run.snapshot.engine,
                    confirmIrreversible: run.snapshot.confirmIrreversible,
                    maxLiveWaitMinutes: run.snapshot.limits.maxLiveWaitMinutes,
                    memoryBlock: memory.block,
                    memoryChannels,
                    toolPrefix,
                    http: httpEnabled && (run.snapshot.engine === "opex" || opencodeHttp.length) ? { tool: run.snapshot.engine === "opencode" ? `${toolPrefix}${HTTP_REQUEST_TOOL}` : HTTP_REQUEST_TOOL, secrets: secretCatalog } : null,
                    warnings: activation.warnings,
                    now: new Date(),
                }),
            internalTools,
            onStep: (step) => recordRunStep(run, { kind: step.kind, label: step.label.slice(0, 200), detail: step.detail ?? null, toolName: step.toolName ?? null, durationMs: step.durationMs ?? null, error: step.error ?? false }),
            onUsage: (step) => {
                addUsage(activation, { tokens: step.tokens, costUsd: step.costUsd })
                if (!step.recorded) {
                    void recordAiConsumption({
                        dedupKey: `routine:${runId}:${activation.startedAt}:${step.stepId}:${++activationStep}`,
                        provider: step.provider,
                        origin: ROUTINE_CONSUMPTION_ORIGIN,
                        subject: runId,
                        model: step.model,
                        inputTokens: step.inputTokens,
                        outputTokens: step.outputTokens,
                        totalTokens: step.tokens,
                        costUsd: step.costUsd,
                        billing: step.billing ?? null,
                    })
                }
                const maxTokens = run.snapshot.limits.maxTokens
                if (maxTokens !== null && activation.baseTokens + activation.usage.tokens >= maxTokens) stopActivation(runId, "tokens")
            },
        }
        const engine = run.snapshot.engine === "opex" ? (await import("./engines/opex")).runOpexEngine(input) : (await import("./engines/opencode")).runOpencodeEngine(input)
        result = await untilStopped(engine, activation.controller.signal)
    } catch (error) {
        result = { error: messageOf(error), text: "" }
    } finally {
        if (timer) clearTimeout(timer)
    }
    await settleActivation(run, activation, result)
}

/**
 * Espera o motor; se o turno for interrompido (limite, teto técnico ou cancelamento) e o motor não
 * parar em `ROUTINE_STOP_GRACE_MS` (provedor ou ferramenta que ignoram o sinal), fecha o turno mesmo
 * assim — a vaga é liberada e a fila anda.
 */
function untilStopped(engine: Promise<EngineResult>, signal: AbortSignal): Promise<EngineResult> {
    let grace: ReturnType<typeof setTimeout> | null = null
    let onAbort: (() => void) | null = null
    const stopped = new Promise<EngineResult>((resolve) => {
        onAbort = () => {
            grace = setTimeout(() => resolve({ error: null, text: "" }), ROUTINE_STOP_GRACE_MS)
        }
        if (signal.aborted) onAbort()
        else signal.addEventListener("abort", onAbort, { once: true })
    })
    return Promise.race([engine, stopped]).finally(() => {
        if (grace) clearTimeout(grace)
        if (onAbort) signal.removeEventListener("abort", onAbort)
    })
}

/** Decide o status do fim do turno (módulo exportado para os testes). */
export function activationVerdict(activation: Pick<Activation, "outcome" | "stopReason">, result: Pick<EngineResult, "error" | "text">, now: Date): {
    status: RoutineRunStatus
    error?: string
    report?: string
    hibernation?: { at: Date; reason: string }
    warning?: string
} {
    if (activation.stopReason === "canceled") return { status: "canceled" }
    if (activation.stopReason === "tokens") return { status: "error", error: TOKEN_LIMIT_MESSAGE }
    if (activation.stopReason === "active") return { status: "error", error: ACTIVE_LIMIT_MESSAGE }
    if (activation.stopReason === "turn_timeout") return { status: "error", error: TURN_TIMEOUT_MESSAGE }
    const outcome = activation.outcome
    if (!outcome && result.error) return { status: "error", error: result.error }
    if (!outcome) return { status: "completed", report: result.text || "Execução concluída sem relato.", warning: "O agente encerrou o turno sem chamar a ferramenta de conclusão." }
    switch (outcome.kind) {
        case "finish":
            return { status: "completed", report: outcome.report }
        case "hibernate":
            return { status: "hibernating", hibernation: { at: outcome.at, reason: outcome.reason } }
        case "live-wait-exceeded":
            return {
                status: "hibernating",
                hibernation: { at: new Date(now.getTime() + LIVE_WAIT_OVERFLOW_HIBERNATE_MINUTES * 60_000), reason: "A espera viva máxima acabou: verifique de novo a condição que você esperava" },
            }
        case "confirmation":
            return { status: "awaiting_confirmation" }
    }
}

async function settleActivation(run: RoutineRunDoc, activation: Activation, result: EngineResult): Promise<void> {
    const runId = String(run._id)
    const now = new Date()
    endActivation(runId)
    forgetRunStepThrottle(runId)
    void pruneRunSteps(run._id).catch((error: unknown) => routineLog.warn({ runId, err: messageOf(error) }, "[routine-agents] retenção dos passos falhou"))
    const verdict = activationVerdict(activation, result, now)
    const usage = activation.usage
    const warnings = [...new Set([...(run.warnings ?? []), ...activation.warnings, ...(verdict.warning ? [verdict.warning] : [])])]
    const set: Partial<IRoutineRun> & Record<string, unknown> = {
        status: verdict.status,
        activationStartedAt: null,
        heartbeatAt: null,
        warnings,
        resumeNote: null,
        costPartial: run.costPartial || usage.costPartial,
    }
    if (usage.costKnown) set.costUsd = (run.costUsd ?? 0) + usage.costUsd
    if (result.messages !== undefined) set.messages = result.messages
    if (result.sessionId !== undefined) set.opencodeSessionId = result.sessionId
    if (verdict.error) set.error = verdict.error
    if (verdict.report) set.report = verdict.report
    if (verdict.hibernation) {
        set.hibernation = verdict.hibernation
        set.parkedAt = now
        set.resumeNote = `Você hibernou para verificar: ${verdict.hibernation.reason}`
        recordRunStep(run, { kind: "hibernate", label: "Hibernada", detail: verdict.hibernation.reason.slice(0, 400), toolName: null, durationMs: null, error: false }, "hibernating")
    }
    if (verdict.status === "awaiting_confirmation" && activation.outcome?.kind === "confirmation") {
        const action = activation.outcome.action
        set.pendingAction = {
            id: randomUUID(),
            summary: action.summary,
            kind: action.kind,
            toolName: action.toolName,
            toolLabel: action.toolLabel,
            input: action.input ? encryptSecret(action.input) : null,
            displayInput: action.displayInput,
            requestedAt: now,
            resolvedAt: null,
            resolution: null,
            note: null,
        }
        set.parkedAt = now
        recordRunStep(run, { kind: "confirmation", label: "Aguardando confirmação", detail: action.summary.slice(0, 400), toolName: action.toolName, durationMs: null, error: false }, "awaiting_confirmation")
    }
    if (isFinalRunStatus(verdict.status)) set.finishedAt = now
    const updated = await RoutineRun.findOneAndUpdate(
        { _id: run._id, status: { $in: ROUTINE_SLOT_STATUSES }, activationId: activation.activationId },
        { $set: set, $inc: { activeMs: Date.now() - activation.startedAt, tokens: usage.tokens, liveWaitMs: activation.liveWaitMs } },
        { new: true },
    ).lean<RoutineRunDoc | null>()
    if (!updated) {
        // Cancelada enquanto o turno fechava (o fecho mantém o id da ativação): soma o uso. Retomada
        // noutra ativação (turno interrompido, OPE-147): o tempo até o último batimento já entrou; só os tokens.
        const own = await RoutineRun.updateOne({ _id: run._id, activationId: activation.activationId }, { $inc: { activeMs: Date.now() - activation.startedAt, tokens: usage.tokens } })
        if (!own.modifiedCount) {
            await RoutineRun.updateOne({ _id: run._id }, { $inc: { tokens: usage.tokens } })
            routineLog.warn({ runId, activationId: activation.activationId }, "[routine-agents] turno encerrado depois de a execução ser retomada noutra ativação: o fecho foi descartado")
        }
    } else await afterSettle(updated, "local")
    await pumpAgent(String(run.agentId)).catch((error: unknown) => routineLog.warn({ err: messageOf(error) }, "[routine-agents] fila não andou"))
}

async function afterSettle(run: RoutineRunDoc, actorId: string): Promise<void> {
    const runId = String(run._id)
    const agent = await RoutineAgent.findById(run.agentId).select({ name: 1 }).lean()
    await emitRunChange(run, run.status)
    if (isFinalRunStatus(run.status)) {
        const acao = run.status === "canceled" ? AcaoAuditoria.ABORTAR : AcaoAuditoria.EXECUTAR
        await auditRun(actorId, runId, acao, { evento: run.status === "completed" ? "concluir" : run.status === "canceled" ? "cancelar" : run.status === "expired" ? "expirar" : "erro", status: run.status, erro: run.error ?? undefined, tokens: run.tokens })
        await publishRunAttention({ id: runId, agentId: String(run.agentId), kind: "finished", status: run.status, agentName: agent?.name })
    } else if (run.status === "awaiting_confirmation") {
        await publishRunAttention({ id: runId, agentId: String(run.agentId), kind: "confirmation", status: run.status, agentName: agent?.name })
    }
    await publishAgentUpdated(String(run.agentId))
    routineLog.info({ runId, status: run.status, tokens: run.tokens }, "[routine-agents] turno da execução encerrado")
}

/** Fecha uma execução fora de um turno (cancelar parada, expirar, turno perdido). */
export async function closeParkedRun(run: RoutineRunDoc, status: "canceled" | "expired" | "error", input: { error?: string; actorId: string; from: RoutineRunStatus[] }): Promise<RoutineRunDoc | null> {
    const now = new Date()
    const parkedMs = run.parkedAt ? now.getTime() - new Date(run.parkedAt).getTime() : 0
    const updated = await RoutineRun.findOneAndUpdate(
        { _id: run._id, status: { $in: input.from } },
        { $set: { status, finishedAt: now, parkedAt: null, activationStartedAt: null, heartbeatAt: null, ...(input.error ? { error: input.error } : {}) }, $inc: { waitingMs: Math.max(0, parkedMs) } },
        { new: true },
    ).lean<RoutineRunDoc | null>()
    if (updated) {
        await afterSettle(updated, input.actorId)
        await pumpAgent(String(run.agentId)).catch(() => undefined)
    }
    return updated
}

/** Volta uma execução parada para a fila com o texto da retomada (hibernação vencida, confirmação respondida). */
export async function requeueParkedRun(run: RoutineRunDoc, from: RoutineRunStatus, set: Record<string, unknown>): Promise<boolean> {
    const now = new Date()
    const parkedMs = run.parkedAt ? now.getTime() - new Date(run.parkedAt).getTime() : 0
    const updated = await RoutineRun.findOneAndUpdate(
        { _id: run._id, status: from },
        { $set: { status: "queued", queuedAt: now, parkedAt: null, ...set }, $inc: { waitingMs: Math.max(0, parkedMs) } },
        { new: true },
    ).lean<RoutineRunDoc | null>()
    if (!updated) return false
    await emitRunChange(updated, "queued")
    await pumpAgent(String(run.agentId))
    return true
}

/**
 * Turno interrompido (OPE-147: 90 s sem batimento — deploy, container parado, processo travado): a
 * execução volta para a fila UMA vez e retoma do último ponto salvo. O tempo ativo vai até o último
 * batimento; dali até agora entra como espera. Só pega a ativação que foi lida (`activationId`).
 */
export async function requeueInterruptedRun(run: RoutineRunDoc, now = new Date()): Promise<boolean> {
    const startedAt = run.activationStartedAt ? new Date(run.activationStartedAt).getTime() : now.getTime()
    const lastBeat = run.heartbeatAt ? new Date(run.heartbeatAt).getTime() : startedAt
    const activeMs = Math.max(0, lastBeat - startedAt)
    const stoppedMs = Math.max(0, now.getTime() - Math.max(lastBeat, startedAt))
    const updated = await RoutineRun.findOneAndUpdate(
        { _id: run._id, status: { $in: ["running", "waiting"] }, activationId: run.activationId ?? null },
        {
            $set: { status: "queued", queuedAt: now, activationStartedAt: null, activationId: null, heartbeatAt: null, resumeNote: run.resumeNote ? `${run.resumeNote}\n${INTERRUPTED_RESUME_NOTE}` : INTERRUPTED_RESUME_NOTE },
            $inc: { interruptions: 1, waitingMs: stoppedMs, activeMs },
        },
        { new: true },
    ).lean<RoutineRunDoc | null>()
    if (!updated) return false
    routineLog.warn({ runId: String(run._id), instance: run.instance ?? null, stoppedMs }, "[routine-agents] turno interrompido (sem batimento): execução de volta à fila")
    recordRunStep(updated, { kind: "notice", label: "Turno interrompido: de volta à fila", detail: "Sem batimento da instância que rodava o turno (reinício, deploy ou prévia derrubada).", toolName: null, durationMs: null, error: false }, "queued")
    await emitRunChange(updated, "queued")
    await pumpAgent(String(run.agentId))
    return true
}

export async function loadRunDoc(runId: string): Promise<RoutineRunDoc> {
    if (!Types.ObjectId.isValid(runId)) throw notFoundRun()
    await routineDb()
    const run = await RoutineRun.findById(runId).lean<RoutineRunDoc | null>()
    if (!run) throw notFoundRun()
    return run
}
