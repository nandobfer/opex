import { Schema, model, models, type Model } from "mongoose"

/**
 * Persistência das métricas dos agentes (OPE-122), **sem expiração**. Ver
 * `aicontext/modules/agent-metrics.md`, "Persistência".
 *
 * - `agent_runs`: uma execução de agente por documento (turno da mesa, rodada adversária, revisão de
 *   PR, execução do Mentor, versão de diagrama, resposta do Opex/Maddox, geração de resumo/tags/prévia/
 *   estimativa, passo do refinamento). Sincronizada das fontes do app pela rotina `agent-usage-daily`
 *   (e sob demanda pela Visão geral), idempotente por `dedupKey`.
 * - `agent_metric_events`: fatos que não tinham registro (etapa com horário, reabertura, interrupção,
 *   retomada, nova tentativa, correção por tipo, falha/correção de CI, conflito, replanejamento pelo
 *   Revisor, ciclo do refinamento, correção de prévia do orçamento), gravados no momento do fato.
 * - `agent_conversations`: estatística durável de cada conversa do Opex e do Maddox (sobrevive à
 *   retenção que apaga a conversa).
 * - `agent_usage_days`: resumo diário de uso por agente (fuso America/Sao_Paulo), por cliente e
 *   repositório.
 * - `agent_metric_tracking`: desde quando cada fato não retroativo é registrado ("Dados desde").
 */

export interface IAgentRun {
    dedupKey: string
    agent: string
    /** Tipo da execução (ex.: `turn`, `round`, `review`, `mentor`, `diagram`, `reply`, `task-summary`). */
    kind: string
    refId: string | null
    title: string | null
    taskId: string | null
    taskCode: string | null
    clientId: string | null
    projectId: string | null
    centralId: string | null
    workbenchId: string | null
    /** Conversa (Opex/Maddox). */
    sessionId: string | null
    startedAt: Date | null
    finishedAt: Date
    ok: boolean
    error: string | null
    inputTokens: number | null
    outputTokens: number | null
    costUsd: number | null
    durationMs: number | null
    data: Record<string, unknown> | null
    /** Mesa excluída ou tarefa arquivada/excluída: fica gravada, mas sai das métricas (`reconcileExcludedRuns`). */
    excluded: boolean
}

const AgentRunSchema = new Schema<IAgentRun>(
    {
        dedupKey: { type: String, required: true, unique: true },
        agent: { type: String, required: true },
        kind: { type: String, required: true },
        refId: { type: String, default: null },
        title: { type: String, default: null },
        taskId: { type: String, default: null },
        taskCode: { type: String, default: null },
        clientId: { type: String, default: null },
        projectId: { type: String, default: null },
        centralId: { type: String, default: null },
        workbenchId: { type: String, default: null },
        sessionId: { type: String, default: null },
        startedAt: { type: Date, default: null },
        finishedAt: { type: Date, required: true },
        ok: { type: Boolean, default: true },
        error: { type: String, default: null },
        inputTokens: { type: Number, default: null },
        outputTokens: { type: Number, default: null },
        costUsd: { type: Number, default: null },
        durationMs: { type: Number, default: null },
        data: { type: Schema.Types.Mixed, default: null },
        excluded: { type: Boolean, default: false },
    },
    { collection: "agent_runs", versionKey: false },
)
AgentRunSchema.index({ agent: 1, finishedAt: -1 })
AgentRunSchema.index({ agent: 1, clientId: 1, finishedAt: -1 })
AgentRunSchema.index({ agent: 1, projectId: 1, finishedAt: -1 })

export interface IAgentMetricEvent {
    dedupKey: string
    agent: string
    type: string
    at: Date
    workbenchId: string | null
    taskId: string | null
    clientId: string | null
    projectId: string | null
    centralId: string | null
    refId: string | null
    data: Record<string, unknown> | null
}

const AgentMetricEventSchema = new Schema<IAgentMetricEvent>(
    {
        dedupKey: { type: String, required: true, unique: true },
        agent: { type: String, required: true },
        type: { type: String, required: true },
        at: { type: Date, required: true },
        workbenchId: { type: String, default: null },
        taskId: { type: String, default: null },
        clientId: { type: String, default: null },
        projectId: { type: String, default: null },
        centralId: { type: String, default: null },
        refId: { type: String, default: null },
        data: { type: Schema.Types.Mixed, default: null },
    },
    { collection: "agent_metric_events", versionKey: false },
)
AgentMetricEventSchema.index({ agent: 1, type: 1, at: -1 })
AgentMetricEventSchema.index({ workbenchId: 1, at: 1 })
AgentMetricEventSchema.index({ taskId: 1, agent: 1, at: 1 })

export interface IAgentConversationTool {
    name: string
    calls: number
    failures: number
}

export interface IAgentConversation {
    agent: string
    sessionId: string
    scope: "owner" | "portal"
    clientId: string | null
    userId: string | null
    title: string | null
    startedAt: Date
    lastMessageAt: Date | null
    messages: number
    replies: number
    failedReplies: number
    tools: IAgentConversationTool[]
    confirmed: number
    cancelled: number
    inputTokens: number
    outputTokens: number
    costUsd: number | null
    /** A conversa foi apagada pela retenção (ou excluída): o registro fica, sem link. */
    purgedAt: Date | null
    syncedAt: Date
}

const AgentConversationSchema = new Schema<IAgentConversation>(
    {
        agent: { type: String, required: true },
        sessionId: { type: String, required: true, unique: true },
        scope: { type: String, required: true },
        clientId: { type: String, default: null },
        userId: { type: String, default: null },
        title: { type: String, default: null },
        startedAt: { type: Date, required: true },
        lastMessageAt: { type: Date, default: null },
        messages: { type: Number, default: 0 },
        replies: { type: Number, default: 0 },
        failedReplies: { type: Number, default: 0 },
        tools: { type: [{ _id: false, name: String, calls: Number, failures: Number }], default: [] },
        confirmed: { type: Number, default: 0 },
        cancelled: { type: Number, default: 0 },
        inputTokens: { type: Number, default: 0 },
        outputTokens: { type: Number, default: 0 },
        costUsd: { type: Number, default: null },
        purgedAt: { type: Date, default: null },
        syncedAt: { type: Date, default: () => new Date() },
    },
    { collection: "agent_conversations", versionKey: false },
)
AgentConversationSchema.index({ agent: 1, startedAt: -1 })
AgentConversationSchema.index({ agent: 1, clientId: 1, startedAt: -1 })

export interface IAgentUsageDay {
    agent: string
    /** Dia `yyyy-MM-dd` no fuso America/Sao_Paulo. */
    day: string
    clientId: string | null
    projectId: string | null
    runs: number
    failures: number
    inputTokens: number
    outputTokens: number
    costUsd: number
    durationMs: number
    updatedAt: Date
}

const AgentUsageDaySchema = new Schema<IAgentUsageDay>(
    {
        agent: { type: String, required: true },
        day: { type: String, required: true },
        clientId: { type: String, default: null },
        projectId: { type: String, default: null },
        runs: { type: Number, default: 0 },
        failures: { type: Number, default: 0 },
        inputTokens: { type: Number, default: 0 },
        outputTokens: { type: Number, default: 0 },
        costUsd: { type: Number, default: 0 },
        durationMs: { type: Number, default: 0 },
        updatedAt: { type: Date, default: () => new Date() },
    },
    { collection: "agent_usage_days", versionKey: false },
)
AgentUsageDaySchema.index({ agent: 1, day: 1, clientId: 1, projectId: 1 }, { unique: true })

export interface IAgentMetricTracking {
    type: string
    since: Date
}

const AgentMetricTrackingSchema = new Schema<IAgentMetricTracking>(
    {
        type: { type: String, required: true, unique: true },
        since: { type: Date, required: true },
    },
    { collection: "agent_metric_tracking", versionKey: false },
)

if (process.env.NODE_ENV === "development") {
    delete models.AgentRun
    delete models.AgentMetricEvent
    delete models.AgentConversation
    delete models.AgentUsageDay
    delete models.AgentMetricTracking
}

export const AgentRun: Model<IAgentRun> = (models.AgentRun as Model<IAgentRun>) || model<IAgentRun>("AgentRun", AgentRunSchema)
export const AgentMetricEvent: Model<IAgentMetricEvent> = (models.AgentMetricEvent as Model<IAgentMetricEvent>) || model<IAgentMetricEvent>("AgentMetricEvent", AgentMetricEventSchema)
export const AgentConversation: Model<IAgentConversation> = (models.AgentConversation as Model<IAgentConversation>) || model<IAgentConversation>("AgentConversation", AgentConversationSchema)
export const AgentUsageDay: Model<IAgentUsageDay> = (models.AgentUsageDay as Model<IAgentUsageDay>) || model<IAgentUsageDay>("AgentUsageDay", AgentUsageDaySchema)
export const AgentMetricTracking: Model<IAgentMetricTracking> =
    (models.AgentMetricTracking as Model<IAgentMetricTracking>) || model<IAgentMetricTracking>("AgentMetricTracking", AgentMetricTrackingSchema)
