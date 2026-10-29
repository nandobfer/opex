/**
 * Constantes do Agente Mentor (parte do Agente Adversário; módulo puro: tela e servidor).
 * O Mentor observa os turnos das mesas e os pedidos do agente desenvolvedor e transforma lições
 * relevantes em memórias do Agente Adversário. Ver `aicontext/modules/adversarial-agent.md`.
 */

/** Configuração salva em `ai_feature_settings` (`feature: "adversarial-mentor"`). */
export const MENTOR_FEATURE = "adversarial-mentor"

/** Aba de `/integracoes/ia` com a configuração do Mentor. */
export const MENTOR_AI_TAB = "agente-mentor" as const

/**
 * Rigor da curadoria (slider), do mais generoso ao mais seletivo. O decisor dá uma nota de 0 a 1
 * para "vale virar regra permanente do revisor?"; a lição segue a partir do limiar do nível.
 */
export const MENTOR_LEVELS = ["generous", "receptive", "balanced", "selective", "relentless"] as const
export type MentorLevel = (typeof MENTOR_LEVELS)[number]

export const MENTOR_LEVEL_DEFS: Record<MentorLevel, { label: string; threshold: number; records: string[]; skips: string[] }> = {
    generous: {
        label: "Generoso",
        threshold: 0.35,
        records: ["Qualquer lição plausível que um revisor poderia usar", "Preferências e convenções recorrentes"],
        skips: ["Erros de digitação", "Mudanças de escopo"],
    },
    receptive: {
        label: "Receptivo",
        threshold: 0.5,
        records: ["Erros que um revisor atento pegaria", "Regras da especificação ignoradas", "Testes faltando em fluxos alterados"],
        skips: ["Preferências pessoais", "Erros de digitação e de escopo"],
    },
    balanced: {
        label: "Equilibrado",
        threshold: 0.65,
        records: ["Erros genéricos ou recorrentes (ex.: crash em runtime)", "Teste de tela faltando", "Regra explícita da spec ignorada"],
        skips: ["Casos isolados de um projeto", "Preferências e estilo", "Erros de digitação e de escopo"],
    },
    selective: {
        label: "Seletivo",
        threshold: 0.8,
        records: ["Classes de erro graves e reaproveitáveis em qualquer projeto", "Falhas que derrubam o app ou perdem dados"],
        skips: ["Tudo o que é específico de um projeto", "Erros menores, estilo e escopo"],
    },
    relentless: {
        label: "Implacável",
        threshold: 0.9,
        records: ["Só lições críticas e claramente generalizáveis"],
        skips: ["Qualquer coisa duvidosa ou de baixo impacto"],
    },
}

/** Mensagens do usuário que podem disparar o Mentor (ao fim do turno que elas originaram). */
export const MENTOR_USER_TRIGGERS = ["plan_revision", "implement_info", "preview_correction", "pr_feedback", "reopen", "adversarial_guidance", "live_chat"] as const
export type MentorUserTrigger = (typeof MENTOR_USER_TRIGGERS)[number]

export const MENTOR_USER_TRIGGER_LABELS: Record<MentorUserTrigger, { label: string; description: string }> = {
    plan_revision: { label: "Revisão do plano", description: "Correções pedidas no plano" },
    implement_info: { label: "Informações ao implementar", description: "Texto digitado ao aprovar o plano" },
    preview_correction: { label: "Correção da prévia", description: "Correções pedidas depois de testar a prévia" },
    pr_feedback: { label: "Feedback do PR", description: "Mudanças pedidas no PR (pela mesa ou por comentários no GitHub)" },
    reopen: { label: "Reabertura", description: "Motivo informado ao reabrir a mesa" },
    adversarial_guidance: { label: "Orientação do bloqueio adversário", description: "Texto enviado em Corrigir, no bloqueio do adversário" },
    live_chat: { label: "Chat ao vivo", description: "Mensagens enviadas durante a execução de um turno" },
}

/** Etapas do agente da mesa que o Mentor observa (turnos da IA) e onde entra o pedido do desenvolvedor. */
export const MENTOR_AI_STAGES = ["planning", "implementing"] as const
export type MentorAiStage = (typeof MENTOR_AI_STAGES)[number]

export const MENTOR_AI_STAGE_LABELS: Record<MentorAiStage, string> = {
    planning: "Planejamento",
    implementing: "Implementação e correções",
}

/** Gravar direto ou sugerir e aguardar aprovação na aba Execuções. */
export const MENTOR_SAVE_MODES = ["direct", "suggest"] as const
export type MentorSaveMode = (typeof MENTOR_SAVE_MODES)[number]

/** De onde veio a execução (pode juntar mais de uma no mesmo turno). */
export const MENTOR_SOURCES = ["user", "ai", "developer"] as const
export type MentorSource = (typeof MENTOR_SOURCES)[number]

export const MENTOR_SOURCE_LABELS: Record<MentorSource, string> = {
    user: "Mensagem do usuário",
    ai: "Turno da IA",
    developer: "Pedido do desenvolvedor",
}

export const MENTOR_RUN_STATUSES = ["queued", "running", "skipped", "discarded", "suggested", "created", "updated", "failed"] as const
export type MentorRunStatus = (typeof MENTOR_RUN_STATUSES)[number]

export const MENTOR_RUN_STATUS_LABELS: Record<MentorRunStatus, string> = {
    queued: "Na fila",
    running: "Avaliando",
    skipped: "Não gravou",
    discarded: "Descartada",
    suggested: "Sugestão",
    created: "Memória criada",
    updated: "Memória atualizada",
    failed: "Falhou",
}

/** Linguagem da cerca do bloco que o agente desenvolvedor usa para pedir uma memória. */
export const LESSON_FENCE = "opex-lesson"

export const MENTOR_TIMEOUT_MIN = 15
export const MENTOR_TIMEOUT_MAX = 600
export const MENTOR_TIMEOUT_DEFAULT = 120

/** Execuções exibidas na aba. */
export const MENTOR_HISTORY_LIMIT = 100
/** Resposta do agente enviada ao decisor/redator (o fim, quando passar). */
export const MENTOR_RESPONSE_MAX = 12_000
/** Mensagem do usuário enviada ao decisor/redator. */
export const MENTOR_MESSAGE_MAX = 8_000

export const MENTOR_UPDATED_EVENT = "adversarial-mentor-updated"
export const MENTOR_AUDIT_ENTITY = "MentorAgenteAdversario"
export const MENTOR_DECISION_CONSUMPTION_ORIGIN = "adversarial-mentor-decision"
export const MENTOR_WRITER_CONSUMPTION_ORIGIN = "adversarial-mentor-writer"
/** Origem gravada nas memórias criadas ou atualizadas pelo Mentor. */
export const MENTOR_MEMORY_SOURCE = "mentor"

export const DEFAULT_MENTOR_WRITER_INSTRUCTIONS = [
    "Prefira regras curtas e acionáveis, escritas como instrução direta ao revisor.",
    "Quando a lição for parecida com uma memória existente, funda as duas numa só (update).",
].join("\n")
