/** Constantes do "Agente Revisor" (módulo puro: tela e servidor). */

export const PR_REVIEW_FEATURE = "pr-review"

/** Quais PRs (dos repositórios das centrais) entram na revisão automática. */
export const PR_REVIEW_SCOPES = ["all", "not_mine", "review_requested"] as const
export type PrReviewScope = (typeof PR_REVIEW_SCOPES)[number]

export const PR_REVIEW_SCOPE_LABELS: Record<PrReviewScope, { label: string; description: string }> = {
    all: { label: "Todos", description: "Todo PR aberto nos repositórios das centrais" },
    not_mine: { label: "Exceto os meus", description: "Só PRs abertos por outras pessoas (autor diferente do usuário do token do GitHub)" },
    review_requested: { label: "Revisor solicitado", description: "Só PRs em que o usuário do token do GitHub está como revisor solicitado" },
}

export const PR_REVIEW_STATES = ["queued", "running", "done", "failed", "interrupted"] as const
export type PrReviewState = (typeof PR_REVIEW_STATES)[number]

export const PR_REVIEW_STATE_LABELS: Record<PrReviewState, string> = {
    queued: "Na fila",
    running: "Revisando",
    done: "Concluída",
    failed: "Falhou",
    interrupted: "Interrompida",
}

export const PR_REVIEW_VERDICTS = ["approved", "changes_requested", "commented"] as const
export type PrReviewVerdict = (typeof PR_REVIEW_VERDICTS)[number]

export const PR_REVIEW_VERDICT_LABELS: Record<PrReviewVerdict, string> = {
    approved: "Aprovado",
    changes_requested: "Mudanças pedidas",
    commented: "Comentado",
}

export const PR_REVIEW_TRIGGERS = ["auto", "manual"] as const
export type PrReviewTrigger = (typeof PR_REVIEW_TRIGGERS)[number]

export const PR_REVIEW_TRIGGER_LABELS: Record<PrReviewTrigger, string> = {
    auto: "Automática",
    manual: "Manual",
}

export const PR_REVIEW_ACTIONS = ["rerun", "stop"] as const
export type PrReviewAction = (typeof PR_REVIEW_ACTIONS)[number]

/**
 * Marcador oculto que o agente põe em toda revisão/comentário publicado. O `agentic-pr-watch`
 * reconhece por ele o feedback da revisão automática (limite de replanejamentos).
 */
export const PR_REVIEW_MARKER = "<!-- opex:pr-review"

export const PR_REVIEW_AUDIT_ENTITY = "RevisaoPR"
/** Evento em `private-app` quando uma revisão muda. Payload: `{ id }`. */
export const PR_REVIEW_UPDATED_EVENT = "pr-review-updated"
export const PR_REVIEW_STAGE_LABEL = "Agente Revisor"
export const PR_REVIEW_INSTRUCTIONS_KEY = "opex-pr-review"
/** Página `/agente-revisor` (lista das revisões, item da barra lateral). */
export const PR_REVIEWS_HREF = "/agente-revisor"
/** Aba de configuração em Integrações › Inteligência Artificial (id mantido para não quebrar links). */
export const PR_REVIEW_SETTINGS_HREF = "/integracoes/ia?aba=revisao-pr"
/** Revisões por página na lista (padrão e máximo aceitos pela API). */
export const PR_REVIEW_PAGE_LIMIT = 20
export const PR_REVIEW_PAGE_LIMIT_MAX = 50

export const PR_REVIEW_CONCURRENCY_MAX = 5
export const PR_REVIEW_TIMEOUT_MIN = 5
export const PR_REVIEW_TIMEOUT_MAX = 240
export const PR_REVIEW_REPLAN_LIMIT_MAX = 20
