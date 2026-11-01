import { loggerFor } from "@/lib/logger"
import { publishAppEvent } from "@/lib/pusher/channels"
import { MENTOR_UPDATED_EVENT } from "../../mentor/constants"
import { mentorThreshold } from "../../mentor/decision"
import type { MentorSettings } from "../../mentor/schemas"
import { MentorRun, mentorDb } from "./models"
import { processMentorRun, type MentorRunInput } from "./run"

/**
 * Fila do Agente Mentor: as execuções de uma mesa rodam uma de cada vez, em segundo plano (a mesa
 * nunca espera). O registro fica em `adversarial_mentor_runs`; o que estava na fila ou rodando quando
 * o app reiniciou vira `failed` ("interrompida") no primeiro uso do processo.
 */

const log = loggerFor({ module: "adversarial-agent", feature: "mentor" })

interface MentorQueueState {
    chains: Map<string, Promise<unknown>>
    startedAt: Date
    recovered: Promise<void> | null
}

const globalForMentor = globalThis as typeof globalThis & { __opexMentorQueue?: MentorQueueState }
const state = (globalForMentor.__opexMentorQueue ??= { chains: new Map(), startedAt: new Date(), recovered: null })

/** Execuções órfãs (de antes deste processo) viram `failed`. Uma vez por processo. */
export function recoverOrphanMentorRuns(): Promise<void> {
    state.recovered ??= (async () => {
        await mentorDb()
        const result = await MentorRun.updateMany(
            { status: { $in: ["queued", "running"] }, createdAt: { $lt: state.startedAt } },
            { $set: { status: "failed", error: "Execução interrompida: o app reiniciou antes de terminar", finishedAt: new Date() } },
        )
        if (result.modifiedCount) {
            log.warn({ count: result.modifiedCount }, "[adversarial-agent] Execuções do Agente Mentor interrompidas pelo reinício")
            await publishAppEvent(MENTOR_UPDATED_EVENT, {}).catch(() => undefined)
        }
    })().catch((error: unknown) => {
        state.recovered = null
        log.warn({ err: error }, "[adversarial-agent] Não foi possível recuperar as execuções do Agente Mentor")
    })
    return state.recovered
}

function record(input: MentorRunInput, settings: MentorSettings, extra: { status: "queued" | "failed"; error?: string }) {
    return MentorRun.create({
        workbenchId: input.workbenchId,
        centralId: input.centralId,
        taskId: input.taskId,
        taskCode: input.taskCode,
        taskTitle: input.taskTitle,
        sources: input.case.sources,
        trigger: input.case.trigger,
        userMessage: input.case.userMessage ? input.case.userMessage.slice(0, 500) : null,
        lessonCount: 0,
        level: settings.level,
        threshold: mentorThreshold(settings.level),
        status: extra.status,
        error: extra.error ?? null,
        ...(extra.status === "failed" ? { finishedAt: new Date(), durationMs: 0 } : {}),
    })
}

/** Registra a execução e a enfileira na corrente da mesa. Devolve o id (a avaliação segue sozinha). */
export async function enqueueMentorRun(input: MentorRunInput, settings: MentorSettings): Promise<string> {
    await recoverOrphanMentorRuns()
    await mentorDb()
    const created = await record(input, settings, { status: "queued" })
    const runId = String(created._id)
    await publishAppEvent(MENTOR_UPDATED_EVENT, { runId }).catch(() => undefined)
    const previous = state.chains.get(input.workbenchId) ?? Promise.resolve()
    const next = previous
        .catch(() => undefined)
        .then(() => processMentorRun(runId, input, settings))
        .finally(() => {
            if (state.chains.get(input.workbenchId) === next) state.chains.delete(input.workbenchId)
        })
    state.chains.set(input.workbenchId, next)
    return runId
}

/** Registra uma execução que já nasce falha (ex.: bloco de lição inválido), visível na aba. */
export async function recordFailedMentorRun(input: MentorRunInput, settings: MentorSettings, error: string): Promise<string> {
    await mentorDb()
    const created = await record(input, settings, { status: "failed", error })
    await publishAppEvent(MENTOR_UPDATED_EVENT, { runId: String(created._id) }).catch(() => undefined)
    return String(created._id)
}

/** Para os testes: espera as execuções enfileiradas da mesa terminarem. */
export function mentorChainOf(workbenchId: string): Promise<unknown> {
    return state.chains.get(workbenchId) ?? Promise.resolve()
}
