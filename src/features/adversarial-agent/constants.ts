/** Constantes do Agente Adversário (módulo puro: tela e servidor). */

/** Configuração salva em `ai_feature_settings` (`feature: "adversarial-agent"`). */
export const ADVERSARIAL_FEATURE = "adversarial-agent"

/** Aba de `/integracoes/ia` com a configuração do agente. */
export const ADVERSARIAL_AI_TAB = "agente-adversario" as const

/** Página com as rodadas (filtros) e as memórias do agente. */
export const ADVERSARIAL_PAGE_HREF = "/agente-adversario"
/** Configuração do agente em Integrações › Inteligência Artificial. */
export const ADVERSARIAL_SETTINGS_HREF = `/integracoes/ia?aba=${ADVERSARIAL_AI_TAB}`

/**
 * Níveis de criticidade do slider, do mais liberal ao mais crítico. Cada nível bloqueia a partir de
 * uma severidade (`blocksFrom`); abaixo dela, o achado vira sugestão e não volta ao implementador.
 */
export const ADVERSARIAL_LEVELS = ["liberal", "tolerant", "balanced", "strict", "relentless"] as const
export type AdversarialLevel = (typeof ADVERSARIAL_LEVELS)[number]

/** Severidades de um achado, da mais grave à mais leve. */
export const FINDING_SEVERITIES = ["critical", "high", "medium", "low", "nit"] as const
export type FindingSeverity = (typeof FINDING_SEVERITIES)[number]

export const FINDING_SEVERITY_LABELS: Record<FindingSeverity, string> = {
    critical: "Crítico",
    high: "Alto",
    medium: "Médio",
    low: "Baixo",
    nit: "Detalhe",
}

/** Categorias de achado; `style` só bloqueia no nível mais crítico. */
export const FINDING_CATEGORIES = ["requirement", "bug", "security", "data", "regression", "edge-case", "error-handling", "project-rule", "design", "tests", "consistency", "style"] as const
export type FindingCategory = (typeof FINDING_CATEGORIES)[number]

export const FINDING_CATEGORY_LABELS: Record<FindingCategory, string> = {
    requirement: "Requisito",
    bug: "Bug",
    security: "Segurança",
    data: "Dados",
    regression: "Regressão",
    "edge-case": "Caso de borda",
    "error-handling": "Tratamento de erro",
    "project-rule": "Regra do projeto",
    design: "Design",
    tests: "Testes",
    consistency: "Consistência",
    style: "Estilo",
}

export const ADVERSARIAL_LEVEL_DEFS: Record<AdversarialLevel, { label: string; blocksFrom: FindingSeverity; blocks: string[]; allows: string[] }> = {
    liberal: {
        label: "Liberal",
        blocksFrom: "critical",
        blocks: ["Bug certo num fluxo principal", "Perda ou corrupção de dados", "Falha grave de segurança", "Requisito da tarefa não implementado"],
        allows: ["Bugs prováveis e regressões menores", "Casos de borda e tratamento de erro", "Design, testes, consistência e estilo"],
    },
    tolerant: {
        label: "Tolerante",
        blocksFrom: "high",
        blocks: ["Tudo do Liberal", "Bug provável", "Regressão em comportamento existente"],
        allows: ["Casos de borda e tratamento de erro", "Regras do projeto não críticas", "Design, testes, consistência e estilo"],
    },
    balanced: {
        label: "Equilibrado",
        blocksFrom: "medium",
        blocks: ["Tudo do Tolerante", "Caso de borda relevante", "Erro não tratado", "Violação de regra explícita do projeto (AGENTS.md)"],
        allows: ["Design e manutenção", "Lógica nova sem teste", "Consistência e estilo"],
    },
    strict: {
        label: "Rigoroso",
        blocksFrom: "low",
        blocks: ["Tudo do Equilibrado", "Problema relevante de design ou manutenção", "Lógica nova sem teste", "Inconsistência com os padrões do código"],
        allows: ["Preferências de estilo e detalhes"],
    },
    relentless: {
        label: "Implacável",
        blocksFrom: "nit",
        blocks: ["Qualquer desvio: legibilidade, nomes, duplicação e estilo"],
        allows: ["Nada além do que está fora do diff"],
    },
}

/** Como corrigir os bloqueios: automático (volta ao implementador) ou pedindo confirmação. */
export const ADVERSARIAL_CORRECTION_MODES = ["auto", "confirm"] as const
export type AdversarialCorrectionMode = (typeof ADVERSARIAL_CORRECTION_MODES)[number]

/** Ao atingir o limite de rodadas ou quando o adversário falha: pausar ou seguir com aviso. */
export const ADVERSARIAL_STOP_POLICIES = ["pause", "continue"] as const
export type AdversarialStopPolicy = (typeof ADVERSARIAL_STOP_POLICIES)[number]

/** Anexos da tarefa no contexto: não enviar, só os nomes, ou nomes e arquivos (anexados ao prompt). */
export const ADVERSARIAL_ATTACHMENT_MODES = ["none", "names", "files"] as const
export type AdversarialAttachmentMode = (typeof ADVERSARIAL_ATTACHMENT_MODES)[number]

export const ADVERSARIAL_ROUNDS_MIN = 1
export const ADVERSARIAL_ROUNDS_MAX = 20
export const ADVERSARIAL_ROUNDS_DEFAULT = 3
export const ADVERSARIAL_TIMEOUT_MIN = 5
export const ADVERSARIAL_TIMEOUT_MAX = 120
export const ADVERSARIAL_TIMEOUT_DEFAULT = 30
/** Anexos enviados como arquivo: tamanho máximo de cada um e do total (MB). */
export const ADVERSARIAL_FILE_MB_MAX = 10
export const ADVERSARIAL_FILES_TOTAL_MB = 20

/** Revisões guardadas na aba Revisões. */
export const ADVERSARIAL_HISTORY_LIMIT = 50
/** Rodadas por página na página do Agente Adversário. */
export const ADVERSARIAL_PAGE_LIMIT = 20
export const ADVERSARIAL_PAGE_LIMIT_MAX = 100

export const ADVERSARIAL_UPDATED_EVENT = "adversarial-review-updated"
export const ADVERSARIAL_AUDIT_ENTITY = "RevisaoAdversaria"
export const ADVERSARIAL_CONSUMPTION_ORIGIN = "adversarial-agent"
/** Chave da entrada durável de instruções na sessão do adversário (OpenCode). */
export const ADVERSARIAL_INSTRUCTIONS_KEY = "opex-adversarial"
/** Rótulo do turno na saída da mesa. */
export const ADVERSARIAL_STAGE_LABEL = "Agente adversário"

/** Situação de uma rodada. */
export const ADVERSARIAL_REVIEW_STATES = ["running", "done", "failed", "interrupted"] as const
export type AdversarialReviewState = (typeof ADVERSARIAL_REVIEW_STATES)[number]

export const ADVERSARIAL_REVIEW_STATE_LABELS: Record<AdversarialReviewState, string> = {
    running: "Revisando",
    done: "Concluída",
    failed: "Falhou",
    interrupted: "Interrompida",
}

/** Decisão tomada depois de uma rodada (pelo fluxo ou pelo usuário). */
export const ADVERSARIAL_DECISIONS = ["approved", "fix-auto", "fix-user", "awaiting", "skipped", "rerun", "proceeded-limit", "proceeded-failure", "failed", "interrupted"] as const
export type AdversarialDecision = (typeof ADVERSARIAL_DECISIONS)[number]

export const ADVERSARIAL_DECISION_LABELS: Record<AdversarialDecision, string> = {
    approved: "Aprovado",
    "fix-auto": "Correção automática",
    "fix-user": "Correção pedida",
    awaiting: "Aguardando você",
    skipped: "Seguiu mesmo assim",
    rerun: "Revisado de novo",
    "proceeded-limit": "Seguiu no limite de rodadas",
    "proceeded-failure": "Seguiu após falha",
    failed: "Falhou",
    interrupted: "Interrompido",
}
