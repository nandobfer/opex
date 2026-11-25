/**
 * Agente Secretário (OPE-192): responde no WhatsApp do dono com a personalidade dele. Módulo PURO.
 * Ver aicontext/modules/secretary-agent.md.
 */

/** Configuração em `ai_feature_settings`. */
export const SECRETARY_FEATURE = "secretary-agent"
/** Origem do consumo de IA (`ai_consumption_logs`). */
export const SECRETARY_CONSUMPTION_ORIGIN = "secretary-agent"
export const SECRETARY_ANALYSIS_CONSUMPTION_ORIGIN = "secretary-analysis"
/** Decisão do assunto (modelo de texto ou JEV): conta no orçamento diário das respostas. */
export const SECRETARY_DECISION_CONSUMPTION_ORIGIN = "secretary-decision"
/** Simulação (aba Simulação): custo real, fora do orçamento diário. */
export const SECRETARY_SIMULATION_CONSUMPTION_ORIGIN = "secretary-simulation"
/** Origens somadas no orçamento diário (a análise e a simulação ficam de fora). */
export const SECRETARY_BUDGET_ORIGINS: readonly string[] = [SECRETARY_CONSUMPTION_ORIGIN, SECRETARY_DECISION_CONSUMPTION_ORIGIN]
/** Entidade da auditoria. */
export const SECRETARY_AUDIT_ENTITY = "AgenteSecretario"

export const SECRETARY_QUERY_KEY = "secretary-agent"

/** Eventos em `private-app` (payload mínimo). */
export const SECRETARY_DECISION_EVENT = "secretary-decision-recorded"
export const SECRETARY_CONVERSATION_EVENT = "secretary-conversation-updated"
export const SECRETARY_NOTICES_EVENT = "secretary-notices-updated"
export const SECRETARY_PERSONALITY_EVENT = "secretary-personality-updated"
export const SECRETARY_ANALYSIS_EVENT = "secretary-analysis-updated"

/** Sub-abas em `/integracoes/ia?aba=agente-secretario&secao=…`. */
export const SECRETARY_SECTIONS = ["geral", "criterios", "simulacao", "personalidade", "memorias", "conversas", "avisos"] as const
export type SecretarySection = (typeof SECRETARY_SECTIONS)[number]

export const SECRETARY_MODES = ["reply", "observe"] as const
export type SecretaryMode = (typeof SECRETARY_MODES)[number]
export const SECRETARY_MODE_LABELS: Record<SecretaryMode, string> = { reply: "Responder", observe: "Só observar" }

/** Padrões da aba Geral (especificação). */
export const SECRETARY_DEFAULTS = {
    groupingSeconds: 15,
    delayMinSeconds: 3,
    delayMaxSeconds: 10,
    pauseMinutes: 30,
    repliesPerHour: 20,
    dailyBudgetUsd: 2,
    analysisMonths: 6,
} as const

/** Fuso das janelas diárias (orçamento) e dos rótulos. */
export const SECRETARY_TIME_ZONE = "America/Sao_Paulo"

/** Histórico de mensagens no prompt do turno. */
export const SECRETARY_HISTORY_LIMIT = 30
/** Partes no máximo ao dividir a resposta. */
export const SECRETARY_MAX_PARTS = 4
/** Atraso para tratar uma mensagem `fromMe` (dá tempo de o envio do próprio agente ser registrado). */
export const FROM_ME_SETTLE_MS = 3_000
/**
 * Mensagem mais velha que isto (pela hora dela no WhatsApp) chegou atrasada, por exemplo entregue pela Evolution
 * depois de uma reconexão: o Secretário não responde, e a de `fromMe` só pausa pelo tempo que ainda faltaria.
 */
export const SECRETARY_STALE_MESSAGE_MS = 10 * 60_000

export function isStaleMessage(timestamp: Date, now: Date = new Date()): boolean {
    return now.getTime() - timestamp.getTime() > SECRETARY_STALE_MESSAGE_MS
}

/** Decisões do registro (uma por mensagem recebida). */
export const SECRETARY_DECISIONS = [
    "replied",
    "ignored",
    "paused",
    "subject-blocked",
    "limit-reached",
    "observe-only",
    "asked-owner",
    "disabled",
    "grouped",
    "discarded",
    "error",
] as const
export type SecretaryDecision = (typeof SECRETARY_DECISIONS)[number]

export const SECRETARY_DECISION_LABELS: Record<SecretaryDecision, string> = {
    replied: "Respondeu",
    ignored: "Ignorou",
    paused: "Pausado",
    "subject-blocked": "Assunto bloqueado",
    "limit-reached": "Limite atingido",
    "observe-only": "Só observar",
    "asked-owner": "Perguntou ao dono",
    disabled: "Desligado",
    grouped: "Agrupada",
    discarded: "Descartada",
    error: "Erro",
}

/** Tom do selo de cada decisão. */
export const SECRETARY_DECISION_TONES: Record<SecretaryDecision, "positive" | "neutral" | "warning" | "negative"> = {
    replied: "positive",
    "asked-owner": "positive",
    ignored: "neutral",
    grouped: "neutral",
    "observe-only": "neutral",
    disabled: "neutral",
    paused: "warning",
    "subject-blocked": "warning",
    "limit-reached": "warning",
    discarded: "warning",
    error: "negative",
}

/** Estado do agente numa conversa (aba Conversas). */
export type ConversationAgentState = "active" | "paused" | "excluded" | "waiting-owner"
export const CONVERSATION_STATE_LABELS: Record<ConversationAgentState, string> = {
    active: "Ativo",
    paused: "Pausado",
    excluded: "Nunca responder",
    "waiting-owner": "Aguardando o dono",
}

export const NOTICE_KINDS = ["question", "limit", "budget", "error"] as const
export type SecretaryNoticeKind = (typeof NOTICE_KINDS)[number]
export const NOTICE_KIND_LABELS: Record<SecretaryNoticeKind, string> = {
    question: "Pergunta",
    limit: "Limite de respostas",
    budget: "Orçamento diário",
    error: "Erro",
}
export const NOTICE_STATUSES = ["pending", "answering", "answered", "discarded", "info"] as const
export type SecretaryNoticeStatus = (typeof NOTICE_STATUSES)[number]

/** Fases da análise de personalidade. */
export const ANALYSIS_PHASES = ["reading", "comparing", "writing"] as const
export type AnalysisPhase = (typeof ANALYSIS_PHASES)[number]
export const ANALYSIS_PHASE_LABELS: Record<AnalysisPhase, string> = { reading: "Lendo", comparing: "Comparando", writing: "Escrevendo" }

export const ANALYSIS_STATUSES = ["running", "done", "cancelled", "failed", "interrupted"] as const
export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number]
export const ANALYSIS_STATUS_LABELS: Record<AnalysisStatus, string> = {
    running: "Em andamento",
    done: "Concluída",
    cancelled: "Cancelada",
    failed: "Falhou",
    interrupted: "Interrompida",
}

export const ANALYSIS_CHAT_STATES = ["queued", "reading", "read", "empty", "failed"] as const
export type AnalysisChatState = (typeof ANALYSIS_CHAT_STATES)[number]
export const ANALYSIS_CHAT_STATE_LABELS: Record<AnalysisChatState, string> = { queued: "Na fila", reading: "Lendo", read: "Lida", empty: "Sem conteúdo útil", failed: "Não foi lida (erro)" }

/** Batimento da análise (mesma regra dos rotineiros: 15 s; interrompida após 90 s). */
export const ANALYSIS_BEAT_MS = 15_000
export const ANALYSIS_STALE_MS = 90_000
/** Mensagens lidas por conversa na análise (as mais recentes do período). */
export const ANALYSIS_MESSAGES_PER_CHAT = 400
