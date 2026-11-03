/** Constantes das métricas dos agentes (módulo puro, OPE-122). */

/** Fuso fixo dos dias das métricas (resumo diário, eventos e buckets dos gráficos). */
export const METRICS_TIME_ZONE = "America/Sao_Paulo"

/** Fatos gravados no momento em que acontecem (`agent_metric_events`), sem expiração. */
export const METRIC_EVENT = {
    stageEntered: "stage-entered",
    reopened: "reopened",
    interrupted: "interrupted",
    resumed: "resumed",
    retried: "retried",
    correction: "correction",
    ciFailed: "ci-failed",
    ciFixed: "ci-fixed",
    conflict: "conflict",
    prReviewReplanned: "pr-review-replanned",
    refinementStarted: "refinement-started",
    refinementQuestions: "refinement-questions",
    refinementCompleted: "refinement-completed",
    refinementAbandoned: "refinement-abandoned",
    budgetCorrection: "budget-correction-requested",
} as const
export type MetricEventType = (typeof METRIC_EVENT)[keyof typeof METRIC_EVENT]

/** Tipo de correção pedida numa mesa (evento `correction`). */
export const CORRECTION_KINDS = ["plan", "preview", "pr"] as const
export type CorrectionKind = (typeof CORRECTION_KINDS)[number]

/**
 * Marcadores de "Dados desde" (`agent_metric_tracking`): gravados uma vez, na primeira subida com a
 * OPE-122 (`$setOnInsert`). Cada métrica não retroativa usa o marcador do fato de que depende.
 */
export const TRACKING_KEYS = [...Object.values(METRIC_EVENT), "conversations", "pr-review-findings", "task-tags-failures"] as const
export type TrackingKey = (typeof TRACKING_KEYS)[number]

/** Evento em `private-app` quando a rotina grava execuções ou resumos novos. Payload: `{ agents }`. */
export const AGENT_METRICS_UPDATED_EVENT = "agent-metrics-updated"
