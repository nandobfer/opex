import { loggerFor } from "@/lib/logger"
import { publishAppEvent } from "@/lib/pusher/channels"
import { MENTOR_HEARTBEAT_MS, MENTOR_HEARTBEAT_STALE_MS, MENTOR_UPDATED_EVENT, type MentorTarget } from "../../mentor/constants"
import { mentorThreshold } from "../../mentor/decision"
import type { MentorSettings } from "../../mentor/schemas"
import { processMentorLearning, type MentorLearningInput } from "./learn"
import { MentorRun, mentorDb } from "./models"

/**
 * Fila do Agente Mentor: as execuções de uma mesa rodam uma de cada vez, em segundo plano (a mesa
 * nunca espera). O registro fica em `adversarial_mentor_runs`. Desde a OPE-165 a execução viva é
 * decidida por batimento no banco (`heartbeatAt`, a cada 15 s): sem batimento por 90 s ela vira `failed`
 * ("interrompida") — nunca pelo mapa em memória, porque outra instância (prévia) pode usar o mesmo banco.
 */

const log = loggerFor({ module: "adversarial-agent", feature: "mentor" })

interface MentorQueueState {
    chains: Map<string, Promise<unknown>>
    lastRecovery: number
}

const globalForMentor = globalThis as typeof globalThis & { __opexMentorQueue?: MentorQueueState }
const state = (globalForMentor.__opexMentorQueue ??= { chains: new Map(), lastRecovery: 0 })

const RECOVERY_INTERVAL_MS = 60_000

/**
 * Execuções sem batimento recente viram `failed` (e podem ser repetidas). As antigas (sem `kind`), que
 * não são mais criadas, saem do `queued`/`running` de vez. No máximo uma vez por minuto por processo.
 */
export async function recoverOrphanMentorRuns(now = new Date()): Promise<number> {
    if (now.getTime() - state.lastRecovery < RECOVERY_INTERVAL_MS) return 0
    state.lastRecovery = now.getTime()
    try {
        await mentorDb()
        const cutoff = new Date(now.getTime() - MENTOR_HEARTBEAT_STALE_MS)
        const result = await MentorRun.updateMany(
            {
                status: { $in: ["queued", "running"] },
                $or: [{ kind: "learning", $or: [{ heartbeatAt: { $lt: cutoff } }, { heartbeatAt: null, createdAt: { $lt: cutoff } }] }, { kind: { $in: [null] } }],
            },
            { $set: { status: "failed", error: "Execução interrompida: o processo parou antes de terminar. Use Tentar novamente.", finishedAt: now } },
        )
        if (result.modifiedCount) {
            log.warn({ count: result.modifiedCount }, "[adversarial-agent] Execuções do Agente Mentor interrompidas")
            await publishAppEvent(MENTOR_UPDATED_EVENT, {}).catch(() => undefined)
        }
        return result.modifiedCount
    } catch (error) {
        state.lastRecovery = 0
        log.warn({ err: error }, "[adversarial-agent] Não foi possível recuperar as execuções do Agente Mentor")
        return 0
    }
}

const isDuplicateKey = (error: unknown) => typeof error === "object" && error !== null && (error as { code?: unknown }).code === 11000

export interface EnqueueLearningOptions {
    attempt?: number
    retryOf?: string | null
}

/**
 * Registra a execução de aprendizado de UMA conclusão e a enfileira na corrente da mesa. Idempotente
 * por `{ workbenchId, completedAt, attempt }`: a segunda chamada para a mesma conclusão devolve `null`.
 */
export async function enqueueMentorLearning(input: MentorLearningInput, settings: MentorSettings, targets: readonly MentorTarget[], options: EnqueueLearningOptions = {}): Promise<string | null> {
    await recoverOrphanMentorRuns()
    await mentorDb()
    let runId: string
    try {
        const created = await MentorRun.create({
            kind: "learning",
            workbenchId: input.workbenchId,
            centralId: input.centralId,
            taskId: input.taskId,
            taskCode: input.taskCode,
            taskTitle: input.taskTitle,
            completedAt: input.completedAt,
            completionKind: input.completionKind,
            attempt: options.attempt ?? 1,
            retryOf: options.retryOf ?? null,
            sources: ["done"],
            trigger: null,
            userMessage: null,
            lessonCount: 0,
            level: settings.level,
            threshold: mentorThreshold(settings.level),
            budgetUsd: settings.digest.budgetUsd,
            status: "queued",
            heartbeatAt: new Date(),
        })
        runId = String(created._id)
    } catch (error) {
        if (isDuplicateKey(error)) return null
        throw error
    }
    await publishAppEvent(MENTOR_UPDATED_EVENT, { runId }).catch(() => undefined)
    // Batimento desde a fila: a espera atrás de outra execução da mesa não parece perdida.
    const beat = setInterval(() => void MentorRun.updateOne({ _id: runId, status: { $in: ["queued", "running"] } }, { $set: { heartbeatAt: new Date() } }).catch(() => undefined), MENTOR_HEARTBEAT_MS)
    beat.unref?.()
    const previous = state.chains.get(input.workbenchId) ?? Promise.resolve()
    const next = previous
        .catch(() => undefined)
        .then(() => processMentorLearning(runId, input, settings, targets))
        .finally(() => {
            clearInterval(beat)
            if (state.chains.get(input.workbenchId) === next) state.chains.delete(input.workbenchId)
        })
    state.chains.set(input.workbenchId, next)
    return runId
}

/** Para os testes: espera as execuções enfileiradas da mesa terminarem. */
export function mentorChainOf(workbenchId: string): Promise<unknown> {
    return state.chains.get(workbenchId) ?? Promise.resolve()
}

/** Para os testes: libera a recuperação na próxima chamada. */
export function resetMentorRecovery(): void {
    state.lastRecovery = 0
}
