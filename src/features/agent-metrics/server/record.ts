import { dbConnect } from "@/lib/db"
import { AgentMetricEvent } from "@/lib/db/models/AgentMetrics"
import { DevTask } from "@/lib/db/models/DevTask"
import { loggerFor } from "@/lib/logger"
import type { AgentId } from "../catalog"
import type { MetricEventType } from "../constants"

const log = loggerFor({ module: "agent-metrics" })

export interface AgentEventInput {
    agent: AgentId
    type: MetricEventType
    at?: Date
    /** Identidade do fato (o mesmo fato gravado duas vezes não duplica). Padrão: tipo + ref + horário. */
    dedupKey?: string
    workbenchId?: string | null
    taskId?: string | null
    centralId?: string | null
    clientId?: string | null
    projectId?: string | null
    refId?: string | null
    data?: Record<string, unknown> | null
}

/** Cliente e repositório da tarefa (para os filtros das métricas). */
async function taskLinks(taskId: string | null | undefined): Promise<{ clientId: string | null; projectId: string | null }> {
    if (!taskId) return { clientId: null, projectId: null }
    const task = await DevTask.findById(taskId).select({ clientId: 1, projectId: 1 }).lean<{ clientId?: string | null; projectId?: string | null }>()
    return { clientId: task?.clientId ?? null, projectId: task?.projectId ? String(task.projectId) : null }
}

/** Grava um fato das métricas (aguardável). Idempotente por `dedupKey`. */
export async function recordAgentEventNow(input: AgentEventInput): Promise<void> {
    await dbConnect()
    const at = input.at ?? new Date()
    const links = input.clientId !== undefined && input.projectId !== undefined ? { clientId: input.clientId, projectId: input.projectId } : await taskLinks(input.taskId)
    const ref = input.workbenchId ?? input.refId ?? input.taskId ?? "app"
    const dedupKey = input.dedupKey ?? `${input.type}:${ref}:${at.getTime()}`
    await AgentMetricEvent.updateOne(
        { dedupKey },
        {
            $setOnInsert: {
                dedupKey,
                agent: input.agent,
                type: input.type,
                at,
                workbenchId: input.workbenchId ?? null,
                taskId: input.taskId ?? null,
                centralId: input.centralId ?? null,
                clientId: links.clientId,
                projectId: links.projectId,
                refId: input.refId ?? null,
                data: input.data ?? null,
            },
        },
        { upsert: true },
    )
}

/**
 * Grava um fato sem bloquear o fluxo (fire-and-forget): uma falha das métricas vira aviso no log e
 * nunca derruba a mesa, o refinamento ou o orçamento que a originou.
 */
export function recordAgentEvent(input: AgentEventInput): void {
    void recordAgentEventNow(input).catch((error: unknown) => log.warn({ err: error, type: input.type, agent: input.agent }, "Não foi possível gravar o evento das métricas"))
}

/** Atalho para fatos de uma mesa (Agente Desenvolvedor). */
export function recordWorkbenchEvent(doc: { _id: unknown; taskId: string; centralId: string }, type: MetricEventType, data?: Record<string, unknown>, at?: Date): void {
    recordAgentEvent({ agent: "desenvolvedor", type, workbenchId: String(doc._id), taskId: doc.taskId, centralId: doc.centralId, data: data ?? null, at })
}

/**
 * "Replanejar com o pedido do PR" disparado por uma revisão do Agente Revisor: liga o replanejamento à
 * revisão que pediu mudanças (a mais recente do PR), base do "% de sugestões aceitas" exato.
 */
export function recordPrReviewReplanned(doc: { _id: unknown; taskId: string; centralId: string }, repo: string, number: number): void {
    const at = new Date()
    void (async () => {
        const { PrReview } = await import("@/lib/db/models/PrReview")
        const review = await PrReview.findOne({ repo, number, verdict: "changes_requested" }).sort({ createdAt: -1 }).select({ _id: 1 }).lean<{ _id: unknown }>()
        await recordAgentEventNow({
            agent: "revisor",
            type: "pr-review-replanned",
            at,
            dedupKey: `pr-review-replanned:${String(doc._id)}:${at.getTime()}`,
            workbenchId: String(doc._id),
            taskId: doc.taskId,
            centralId: doc.centralId,
            refId: review ? String(review._id) : null,
            data: { repo, number },
        })
    })().catch((error: unknown) => log.warn({ err: error, repo, number }, "Não foi possível gravar o replanejamento pelo Revisor"))
}

export interface AgentRunInput {
    dedupKey: string
    agent: AgentId
    kind: string
    finishedAt: Date
    startedAt?: Date | null
    ok?: boolean
    error?: string | null
    refId?: string | null
    title?: string | null
    taskId?: string | null
    taskCode?: string | null
    clientId?: string | null
    projectId?: string | null
    centralId?: string | null
    workbenchId?: string | null
    sessionId?: string | null
    inputTokens?: number | null
    outputTokens?: number | null
    costUsd?: number | null
    durationMs?: number | null
    data?: Record<string, unknown> | null
}

/** Grava (ou atualiza) uma execução de agente, idempotente por `dedupKey`. */
export async function recordAgentRunNow(input: AgentRunInput): Promise<void> {
    await dbConnect()
    const { AgentRun } = await import("@/lib/db/models/AgentMetrics")
    const links = input.clientId !== undefined && input.projectId !== undefined ? { clientId: input.clientId, projectId: input.projectId } : await taskLinks(input.taskId)
    await AgentRun.updateOne(
        { dedupKey: input.dedupKey },
        {
            $set: {
                agent: input.agent,
                kind: input.kind,
                refId: input.refId ?? null,
                title: input.title ?? null,
                taskId: input.taskId ?? null,
                taskCode: input.taskCode ?? null,
                clientId: links.clientId,
                projectId: links.projectId,
                centralId: input.centralId ?? null,
                workbenchId: input.workbenchId ?? null,
                sessionId: input.sessionId ?? null,
                startedAt: input.startedAt ?? null,
                finishedAt: input.finishedAt,
                ok: input.ok ?? true,
                error: input.error ?? null,
                inputTokens: input.inputTokens ?? null,
                outputTokens: input.outputTokens ?? null,
                costUsd: input.costUsd ?? null,
                durationMs: input.durationMs ?? null,
                data: input.data ?? null,
            },
        },
        { upsert: true },
    )
}

/** Execução sem bloquear o fluxo (falha vira aviso no log). */
export function recordAgentRun(input: AgentRunInput): void {
    void recordAgentRunNow(input).catch((error: unknown) => log.warn({ err: error, agent: input.agent, kind: input.kind }, "Não foi possível gravar a execução das métricas"))
}
