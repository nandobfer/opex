/**
 * Constantes do Agente Mentor (parte do Agente Adversário; módulo puro: tela e servidor).
 * Desde a OPE-165 o Mentor aprende UMA vez por conclusão da mesa: lê a transcrição inteira, extrai os
 * casos (digestor) e cria, atualiza, funde ou arquiva memórias do desenvolvedor (globais e da central) e
 * do Agente Adversário. Ver `aicontext/modules/adversarial-agent.md`.
 */

/** Configuração salva em `ai_feature_settings` (`feature: "adversarial-mentor"`). */
export const MENTOR_FEATURE = "adversarial-mentor"

/** Aba de `/integracoes/ia` com a configuração do Mentor. */
export const MENTOR_AI_TAB = "agente-mentor" as const

/** Página com as execuções do Mentor (filtros). */
export const MENTOR_PAGE_HREF = "/agente-mentor"
/** Configuração do Mentor em Integrações › Inteligência Artificial. */
export const MENTOR_SETTINGS_HREF = `/integracoes/ia?aba=${MENTOR_AI_TAB}`

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

/**
 * Gatilhos por mensagem do usuário (até a OPE-165): só para exibir e filtrar o histórico. Desde a
 * OPE-165 o Mentor roda uma vez por conclusão da mesa e lê a transcrição inteira.
 */
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

/** De onde veio a execução (pode juntar mais de uma no mesmo turno). */
export const MENTOR_SOURCES = ["done", "user", "ai", "developer"] as const
export type MentorSource = (typeof MENTOR_SOURCES)[number]

export const MENTOR_SOURCE_LABELS: Record<MentorSource, string> = {
    done: "Conclusão da mesa",
    user: "Mensagem do usuário",
    ai: "Turno da IA",
    // Execuções anteriores à OPE-104 (o bloco opex-lesson saiu: o desenvolvedor aprende sozinho).
    developer: "Pedido do desenvolvedor",
}

export const MENTOR_RUN_STATUSES = ["queued", "running", "learned", "skipped", "discarded", "suggested", "created", "updated", "failed"] as const
export type MentorRunStatus = (typeof MENTOR_RUN_STATUSES)[number]

export const MENTOR_RUN_STATUS_LABELS: Record<MentorRunStatus, string> = {
    queued: "Na fila",
    running: "Avaliando",
    learned: "Aprendizado aplicado",
    skipped: "Não gravou",
    discarded: "Descartada",
    suggested: "Sugestão",
    created: "Memória criada",
    updated: "Memória atualizada",
    failed: "Falhou",
}

export const MENTOR_TIMEOUT_MIN = 15
export const MENTOR_TIMEOUT_MAX = 600
export const MENTOR_TIMEOUT_DEFAULT = 120

/** Tempo máximo de cada chamada do digestor (segundos): a transcrição é longa. */
export const MENTOR_DIGEST_TIMEOUT_MIN = 30
export const MENTOR_DIGEST_TIMEOUT_MAX = 900
export const MENTOR_DIGEST_TIMEOUT_DEFAULT = 300
/** Orçamento por execução (US$), conferido depois de cada chamada. */
export const MENTOR_BUDGET_MIN = 0.01
export const MENTOR_BUDGET_MAX = 20
export const MENTOR_BUDGET_DEFAULT = 0.3
/** Limiar de compactação da transcrição (caracteres). */
export const MENTOR_COMPACT_MIN = 20_000
export const MENTOR_COMPACT_MAX = 4_000_000
export const MENTOR_COMPACT_DEFAULT = 400_000
/** Batimento de uma execução em andamento; sem batimento por este tempo, ela é dada como perdida. */
export const MENTOR_HEARTBEAT_MS = 15_000
export const MENTOR_HEARTBEAT_STALE_MS = 90_000
/** Prazo total de uma execução de aprendizado: passou, ela falha, para o batimento e libera a fila da mesa. */
export const MENTOR_RUN_MAX_MS = 60 * 60_000

/** Operações que o Mentor aplica nas memórias (nunca exclui). */
export const MENTOR_OPERATIONS = ["create", "update", "merge", "archive"] as const
export type MentorOperation = (typeof MENTOR_OPERATIONS)[number]
export const MENTOR_OPERATION_LABELS: Record<MentorOperation, string> = { create: "Criada", update: "Atualizada", merge: "Fundida", archive: "Arquivada" }

/** Situação de um caso extraído da transcrição. */
export const MENTOR_CASE_STATUSES = ["pending", "skipped", "applied", "partial", "discarded", "failed"] as const
export type MentorCaseStatus = (typeof MENTOR_CASE_STATUSES)[number]
export const MENTOR_CASE_STATUS_LABELS: Record<MentorCaseStatus, string> = {
    pending: "Aguardando",
    skipped: "Não gravou",
    applied: "Aplicado",
    partial: "Aplicado em parte",
    discarded: "Descartado",
    failed: "Falhou",
}

/** Execuções exibidas na aba. */
export const MENTOR_HISTORY_LIMIT = 100
/** Execuções por página na página do Agente Mentor. */
export const MENTOR_PAGE_LIMIT = 20
export const MENTOR_PAGE_LIMIT_MAX = 100

export const MENTOR_UPDATED_EVENT = "adversarial-mentor-updated"
export const MENTOR_AUDIT_ENTITY = "MentorAgenteAdversario"
export const MENTOR_DECISION_CONSUMPTION_ORIGIN = "adversarial-mentor-decision"
export const MENTOR_WRITER_CONSUMPTION_ORIGIN = "adversarial-mentor-writer"
export const MENTOR_ROUTER_CONSUMPTION_ORIGIN = "adversarial-mentor-router"
export const MENTOR_DIGEST_CONSUMPTION_ORIGIN = "adversarial-mentor-digest"

/**
 * Destinos das memórias do Mentor (OPE-97): os ids são as listas do catálogo de memórias dos agentes.
 * O Triador escolhe um por execução; `developer-central` é a lista da central da mesa.
 */
export const MENTOR_TARGETS = ["adversarial", "developer-global", "developer-central"] as const
export type MentorTarget = (typeof MENTOR_TARGETS)[number]

export const MENTOR_TARGET_LABELS: Record<MentorTarget, { label: string; short: string; criteria: string }> = {
    adversarial: {
        label: "Agente Adversário",
        short: "Adversário",
        criteria: "A lição é sobre O QUE VERIFICAR ou detectar numa revisão de código: a classe de erro e que teste ou pergunta a teria pegado.",
    },
    "developer-global": {
        label: "Agente desenvolvedor — globais",
        short: "Desenvolvedor · global",
        criteria:
            "A lição é sobre COMO FAZER o trabalho de desenvolvimento e continuaria útil num projeto diferente (processo, hábito, cuidado recorrente). Teste: sem os nomes deste projeto, a orientação continua valendo.",
    },
    "developer-central": {
        label: "Agente desenvolvedor — da central",
        short: "Desenvolvedor · central",
        criteria:
            "A lição SÓ faz sentido NESTE projeto: convenção, comando, caminho, pasta, componente, serviço ou preferência do dono desta central. Teste: aplicá-la em outro projeto exigiria reescrevê-la.",
    },
}
/** Origem gravada nas memórias criadas ou atualizadas pelo Mentor. */
export const MENTOR_MEMORY_SOURCE = "mentor" as const

/**
 * Motivo do `skip` do redator (OPE-132): `covered` exige o id de uma memória DA LISTA DE DESTINO;
 * `no_lesson` dispensa (o redator reavaliou e não há lição). Cobertura em outra lista nunca é skip.
 */
export const MENTOR_SKIP_KINDS = ["covered", "no_lesson"] as const
export type MentorSkipKind = (typeof MENTOR_SKIP_KINDS)[number]

/** Tentativas do redator por execução (a segunda recebe o motivo da recusa). */
export const MENTOR_WRITER_ATTEMPTS = 2

// ── Reorganização do acervo (OPE-132) ──────────────────────────────────────

export const MENTOR_REORG_PAGE = "/integracoes/ia?aba=agente-mentor"
/** Seção da aba Agente Mentor com o botão "Reorganizar memórias". */
export const MENTOR_REORG_SECTION = "reorganizacao" as const
export const MENTOR_REORG_UPDATED_EVENT = "adversarial-mentor-reorg-updated"
export const MENTOR_REORG_AUDIT_ENTITY = "MentorReorganizacao"
export const MENTOR_REORG_ROUTER_CONSUMPTION_ORIGIN = "adversarial-mentor-reorg-router"
export const MENTOR_REORG_WRITER_CONSUMPTION_ORIGIN = "adversarial-mentor-reorg-writer"
/** Reorganizações exibidas no histórico da seção. */
export const MENTOR_REORG_HISTORY_LIMIT = 20
/** Tentativas do redator por memória revisada na reorganização. */
export const MENTOR_REORG_WRITER_ATTEMPTS = 2

export const MENTOR_REORG_STATUSES = ["queued", "running", "ready", "applying", "applied", "partial", "failed", "cancelled", "discarded"] as const
export type MentorReorgStatus = (typeof MENTOR_REORG_STATUSES)[number]

export const MENTOR_REORG_STATUS_LABELS: Record<MentorReorgStatus, string> = {
    queued: "Na fila",
    running: "Revisando",
    ready: "Plano pronto",
    applying: "Aplicando",
    applied: "Aplicado",
    partial: "Aplicado em parte",
    failed: "Falhou",
    cancelled: "Cancelada",
    discarded: "Descartada",
}

/** `ready`/`partial` ainda aceitam itens pendentes; `running` pode ser cancelada. */
export const MENTOR_REORG_ACTIVE_STATUSES: MentorReorgStatus[] = ["queued", "running", "applying"]
export const MENTOR_REORG_DECIDABLE_STATUSES: MentorReorgStatus[] = ["ready", "partial"]

export const MENTOR_REORG_ACTIONS = ["keep", "rewrite", "move", "merge"] as const
export type MentorReorgAction = (typeof MENTOR_REORG_ACTIONS)[number]

export const MENTOR_REORG_ACTION_LABELS: Record<MentorReorgAction, string> = {
    keep: "Manter",
    rewrite: "Reescrever",
    move: "Mover",
    merge: "Fundir",
}

export const MENTOR_REORG_ITEM_STATUSES = ["pending", "approved", "discarded", "applied", "failed"] as const
export type MentorReorgItemStatus = (typeof MENTOR_REORG_ITEM_STATUSES)[number]
export const MENTOR_REORG_ITEM_STATUS_LABELS: Record<MentorReorgItemStatus, string> = {
    pending: "Aguardando decisão",
    approved: "Aprovada",
    discarded: "Descartada",
    applied: "Aplicada",
    failed: "Falhou",
}

export const DEFAULT_MENTOR_WRITER_INSTRUCTIONS = [
    "Prefira regras curtas e acionáveis, escritas como instrução direta ao agente que vai lê-las.",
    "Quando a lição for parecida com uma memória existente, atualize ou funda em vez de criar outra.",
].join("\n")
