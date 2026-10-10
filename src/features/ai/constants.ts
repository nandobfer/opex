/** Constantes das features de IA (módulo puro). */

/** Abas da página "Provedores de IA". `provedores` é a padrão (omitida da URL). */
export const AI_TABS = ["provedores", "entender-tarefas", "resumos-tarefas", "orcamentos", "desenvolvimento-agentico"] as const
export type AiTab = (typeof AI_TABS)[number]

/** Features do app que usam IA (uma configuração salva por feature). */
export const AI_FEATURE_IDS = ["understand-task", "task-summary", "budget-preview"] as const
export type AiFeatureId = (typeof AI_FEATURE_IDS)[number]

export const AI_AUDIT_ENTITY = "FeatureIA"

/** Evento em `private-app` quando a configuração de uma feature muda. Payload: `{ feature }`. */
export const AI_FEATURE_UPDATED_EVENT = "ai-feature-updated"

export const UNDERSTAND_TASK_FORMATS = ["sections", "free"] as const
export type UnderstandTaskFormat = (typeof UNDERSTAND_TASK_FORMATS)[number]

export const UNDERSTAND_TASK_FORMAT_LABELS: Record<UnderstandTaskFormat, string> = {
    sections: "Seções fixas",
    free: "Texto livre",
}

/** Seções pedidas no formato "Seções fixas". */
export const UNDERSTAND_TASK_SECTIONS = ["Resumo", "O que precisa ser feito", "Pontos de atenção e riscos", "Dúvidas para o solicitante"] as const

export const DEFAULT_UNDERSTAND_TASK_INSTRUCTIONS = [
    "Você é um analista de desenvolvimento sênior que ajuda um desenvolvedor a entender uma tarefa do Centro de Desenvolvimento antes de começar.",
    "Explique em português do Brasil, de forma objetiva, o que a tarefa pede, o contexto de negócio e o que precisa ser entregue.",
    "Use os comentários e o histórico para identificar decisões, mudanças de escopo e pendências. Não invente requisitos: quando algo não estiver claro, aponte como dúvida.",
].join("\n")

export const UNDERSTAND_TASK_INCLUDE_LABELS = {
    comments: { label: "Comentários", description: "Data e texto de cada comentário" },
    history: { label: "Histórico", description: "Mudanças de coluna, prioridade e campos" },
    timeLogs: { label: "Apontamentos de horas", description: "Quando e a descrição" },
} as const

// ── Resumos de tarefas ───────────────────────────────────────────────────────

/** Faixa do tamanho (caracteres) de um resumo de 1 linha. */
export const TASK_SUMMARY_MAX_LENGTH_MIN = 40
export const TASK_SUMMARY_MAX_LENGTH_MAX = 400
export const TASK_SUMMARY_MAX_LENGTH_DEFAULT = 140

export const DEFAULT_TASK_SUMMARY_INSTRUCTIONS = [
    "Você resume tarefas de desenvolvimento para um quadro kanban.",
    "Escreva em português do Brasil, com linguagem direta, o objetivo central da tarefa em UMA única linha.",
    "Não use Markdown, listas, aspas nem ponto final. Não repita o título.",
].join("\n")

// ── Orçamentos (prévia do portal do cliente) ─────────────────────────────────

export const DEFAULT_BUDGET_PREVIEW_INSTRUCTIONS = [
    "Você é um analista de desenvolvimento sênior que interpreta pedidos de clientes e prepara uma tarefa para o time.",
    "Leia a descrição do cliente, categorizando o tipo, a prioridade, um título curto e uma especificação técnica objetiva.",
    "Escreva em português do Brasil. As horas estimadas são de implementação e devem ser calibradas pelo histórico de horas informado.",
    "Não invente requisitos: quando a descrição for ambígua, faça a interpretação mais razoável e seja conservador nas horas.",
].join("\n")
