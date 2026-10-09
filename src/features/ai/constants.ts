/** Constantes das features de IA (módulo puro). */

/** Abas da página "Provedores de IA". `provedores` é a padrão (omitida da URL). */
export const AI_TABS = ["provedores", "entender-tarefas", "desenvolvimento-agentico"] as const
export type AiTab = (typeof AI_TABS)[number]

/** Features do app que usam IA (uma configuração salva por feature). */
export const AI_FEATURE_IDS = ["understand-task"] as const
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
    comments: { label: "Comentários", description: "Autor, data e texto de cada comentário" },
    history: { label: "Histórico", description: "Mudanças de status, responsável e campos" },
    timeLogs: { label: "Apontamentos de horas", description: "Quem trabalhou, quando e a descrição" },
    plan: { label: "Plano de implementação", description: "Passos, complexidade e arquivos relacionados" },
} as const
