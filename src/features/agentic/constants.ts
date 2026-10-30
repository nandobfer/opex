/** Vocabulário do desenvolvimento agêntico (módulo puro: cliente e servidor). */

/** Etapas em que um agente do OpenCode é usado (cada uma com agente e modelo próprios). */
export const AGENT_ROLES = ["planning", "implementation", "build", "pr", "fork"] as const
export type AgentRole = (typeof AGENT_ROLES)[number]

export const AGENT_ROLE_LABELS: Record<AgentRole, { label: string; description: string }> = {
    planning: { label: "Planejamento", description: "Gera e corrige o plano (inclusive após correções da prévia e do PR)" },
    implementation: { label: "Implementação", description: "Cria o worktree, move a sessão e implementa o plano aprovado" },
    build: { label: "Build e ambiente", description: "Sobe a prévia com docker compose e, no fim, limpa o ambiente" },
    pr: { label: "Pull Request", description: "Valida, faz commit e push e abre o PR com o gh" },
    fork: { label: "Fork da conversa", description: "Responde nos forks da conversa e consolida o resumo para integrar. Com o agente plan, o fork abre em Plan (somente leitura); com outros (ex.: build), em Build (pode alterar arquivos). O modo pode ser trocado na conversa" },
}

/**
 * Etapas da mesa de trabalho. As "de execução" rodam um turno do agente; as demais esperam o
 * usuário (ou o PR, em `pr_open`).
 */
export const WORKBENCH_STAGES = [
    "planning",
    "plan_review",
    "implementing",
    /** Agente Adversário: revisão do agente adversário depois da implementação. */
    "adversarial_review",
    /** Agente Adversário: o adversário bloqueou e a mesa aguarda o usuário. */
    "adversarial_blocked",
    "build_queued",
    "building",
    "preview",
    "opening_pr",
    "pr_open",
    "changes_requested",
    "resolving_conflicts",
    "fixing_ci",
    "merging_pr",
    "deleting_pr_branch",
    "finishing",
    "done",
] as const
export type WorkbenchStage = (typeof WORKBENCH_STAGES)[number]

export const RUNNING_STAGES: readonly WorkbenchStage[] = ["planning", "implementing", "adversarial_review", "building", "opening_pr", "resolving_conflicts", "fixing_ci", "merging_pr", "deleting_pr_branch", "finishing"]

/**
 * Etapas que NÃO ocupam vaga no limite de mesas da central (`maxConcurrent`): a mesa espera o
 * usuário (plano/prévia) ou o PR. Ao sair delas para executar, a mesa aguarda vaga se o limite estiver cheio.
 */
export const SLOT_EXEMPT_STAGES: readonly WorkbenchStage[] = ["plan_review", "adversarial_blocked", "preview", "pr_open"]

/**
 * Etapas que o usuário (ou o Agente Opex) pode definir diretamente na mesa ("Definir etapa"), com
 * os pré-requisitos validados no servidor (`manualStageBlock`). As de execução sempre exigem o fluxo normal.
 */
export const MANUAL_STAGES = ["plan_review", "preview", "pr_open", "changes_requested", "done"] as const satisfies readonly WorkbenchStage[]
export type ManualStage = (typeof MANUAL_STAGES)[number]

/** O que uma mesa aguardando vaga vai executar quando a vaga chegar. */
export const PENDING_TURN_ACTIONS = [
    "revise-plan",
    "implement",
    "request-correction",
    "approve",
    "submit-pr-feedback",
    "reopen",
    "pr-feedback",
    "pr-conflict",
    "pr-ci-fix",
    "pr-auto-merge",
    "pr-cleanup",
    "generate-preview",
    "adversarial-fix",
    "adversarial-skip",
    "adversarial-rerun",
] as const
export type PendingTurnAction = (typeof PENDING_TURN_ACTIONS)[number]

export const PENDING_TURN_LABELS: Record<PendingTurnAction, string> = {
    "revise-plan": "Corrigir o plano",
    implement: "Implementar o plano",
    "request-correction": "Corrigir a prévia",
    approve: "Abrir o Pull Request",
    "submit-pr-feedback": "Replanejar com as mudanças do PR",
    reopen: "Reabrir a mesa",
    "pr-feedback": "Replanejar com o pedido do PR",
    "pr-conflict": "Resolver o conflito do PR",
    "pr-ci-fix": "Corrigir o CI do PR",
    "pr-auto-merge": "Mergear o PR",
    "pr-cleanup": "Limpar o ambiente após o merge",
    "generate-preview": "Gerar a prévia",
    "adversarial-fix": "Corrigir os bloqueios do agente adversário",
    "adversarial-skip": "Seguir sem os bloqueios do agente adversário",
    "adversarial-rerun": "Revisar de novo (agente adversário)",
}

export const WORKBENCH_STAGE_LABELS: Record<WorkbenchStage, string> = {
    planning: "Planejando",
    plan_review: "Plano pronto",
    implementing: "Implementando",
    adversarial_review: "Revisão adversária",
    adversarial_blocked: "Revisão bloqueou",
    build_queued: "Na fila do build",
    building: "Subindo a prévia",
    preview: "Prévia pronta",
    opening_pr: "Abrindo o PR",
    pr_open: "PR aberto",
    changes_requested: "Mudanças pedidas no PR",
    resolving_conflicts: "Resolvendo conflitos",
    fixing_ci: "Corrigindo o CI",
    merging_pr: "Mergeando o PR",
    deleting_pr_branch: "Excluindo a branch remota",
    finishing: "Concluindo",
    done: "Concluída",
}

/** Agente usado por etapa de execução. */
export const STAGE_ROLE: Partial<Record<WorkbenchStage, AgentRole>> = {
    planning: "planning",
    implementing: "implementation",
    building: "build",
    opening_pr: "pr",
    resolving_conflicts: "pr",
    fixing_ci: "pr",
    merging_pr: "pr",
    deleting_pr_branch: "pr",
    finishing: "build",
}

/** Papéis da conversa principal cujo modelo pode ser trocado na mesa (o fork tem a própria troca). */
export const WORKBENCH_MODEL_ROLES = ["planning", "implementation", "build", "pr"] as const satisfies readonly AgentRole[]
export type WorkbenchModelRole = (typeof WORKBENCH_MODEL_ROLES)[number]

/** Rótulo do seletor de modelo da mesa e dos avisos ("Modelo do Plano"). */
export const WORKBENCH_MODEL_ROLE_LABELS: Record<WorkbenchModelRole, string> = {
    planning: "Modelo do Plano",
    implementation: "Modelo da Implementação",
    build: "Modelo da Prévia",
    pr: "Modelo do Pull Request",
}

/**
 * Papel cujo modelo o seletor da mesa troca em cada etapa (`null` = seletor oculto: Concluindo e
 * Concluída). "Mudanças pedidas" troca o do Plano (o próximo turno dali é o replanejamento). Com falha,
 * vale a etapa em que a mesa parou. Etapa nova entra aqui (o `Record` é exaustivo).
 */
export const STAGE_MODEL_ROLE: Record<WorkbenchStage, WorkbenchModelRole | null> = {
    planning: "planning",
    plan_review: "planning",
    changes_requested: "planning",
    implementing: "implementation",
    adversarial_review: null,
    adversarial_blocked: "implementation",
    build_queued: "build",
    building: "build",
    preview: "build",
    opening_pr: "pr",
    pr_open: "pr",
    resolving_conflicts: "pr",
    fixing_ci: "pr",
    merging_pr: "pr",
    deleting_pr_branch: "pr",
    finishing: null,
    done: null,
}

/** Passos exibidos no topo da mesa (várias etapas caem no mesmo passo). */
export const WORKBENCH_STEPS = [
    { id: "plan", label: "Plano", stages: ["planning", "plan_review"] },
    { id: "implement", label: "Implementação", stages: ["implementing", "adversarial_review", "adversarial_blocked"] },
    { id: "preview", label: "Prévia", stages: ["build_queued", "building", "preview"] },
    { id: "pr", label: "Pull Request", stages: ["opening_pr", "pr_open", "changes_requested", "resolving_conflicts", "fixing_ci", "merging_pr", "deleting_pr_branch"] },
    { id: "done", label: "Concluída", stages: ["finishing", "done"] },
] as const satisfies readonly { id: string; label: string; stages: readonly WorkbenchStage[] }[]

/** `idle`: parada esperando ação; `running`: turno do agente em andamento. */
export const RUN_STATES = ["idle", "running", "failed", "interrupted"] as const
export type RunState = (typeof RUN_STATES)[number]

/**
 * Faixa padrão global de portas das prévias (docker compose), editada em "Configurações Padrão";
 * cada central herda ou personaliza (`environment.inheritPorts`).
 */
export const PREVIEW_PORT_MIN = 5002
export const PREVIEW_PORT_MAX = 5998

/** Faixa antiga: vale para centrais salvas sem faixa própria (antes da faixa configurável). */
export const LEGACY_PREVIEW_PORT_MIN = 4001
export const LEGACY_PREVIEW_PORT_MAX = 4098

/** Raiz dos repositórios na máquina (usada para sugerir o diretório das sessões ao criar uma central). */
export const AGENTIC_CODE_ROOT = "/home/burgos/code"

export const AGENTIC_AUDIT_CENTRAL = "CentralDesenvolvimento"
export const AGENTIC_AUDIT_WORKBENCH = "MesaDeTrabalho"
export const AGENTIC_AUDIT_FORK = "ForkDaMesa"
export const AGENTIC_FEATURE = "agentic-dev"

/** Evento em `private-app` quando uma central, uma mesa ou a configuração muda. */
export const AGENTIC_UPDATED_EVENT = "agentic-updated"

/** Escopo dos logs de uma central na integração "Inteligência Artificial" (`data.scope`). */
export const centralLogScope = (centralId: string) => `agentic:${centralId}`

/** Seções da tarefa enviadas ao planejamento. */
export const AGENTIC_INCLUDE_LABELS = {
    comments: { label: "Comentários", description: "Data e texto de cada comentário" },
    history: { label: "Histórico", description: "Mudanças de coluna, prioridade e campos" },
} as const

// ---------------------------------------------------------------------------
// Forks da conversa
// ---------------------------------------------------------------------------

/**
 * Ciclo de vida de um fork: `active` (conversando), `closed` (conversa pausada: retomar, integrar ou
 * descartar), `integrating` (resumo em revisão), `integrated` (histórico somente leitura) e
 * `concluded` (finalizado junto com a mesa; histórico somente leitura).
 */
export const FORK_STATUSES = ["active", "closed", "integrating", "integrated", "concluded"] as const
export type ForkStatus = (typeof FORK_STATUSES)[number]

export const FORK_STATUS_LABELS: Record<ForkStatus, string> = {
    active: "Ativo",
    closed: "Pausado",
    integrating: "Integrando",
    integrated: "Integrado",
    concluded: "Concluído",
}

/** Forks ainda em aberto (nem integrados, nem descartados, nem concluídos). */
export const OPEN_FORK_STATUSES: readonly ForkStatus[] = ["active", "closed", "integrating"]

/** Modo do fork: `plan` (somente leitura) ou `build` (pode alterar arquivos conforme as permissões do agente). */
export const FORK_MODES = ["plan", "build"] as const
export type ForkMode = (typeof FORK_MODES)[number]

export const FORK_MODE_LABELS: Record<ForkMode, { label: string; description: string }> = {
    plan: { label: "Plan", description: "Somente leitura: lê o código e responde, sem alterar arquivos" },
    build: { label: "Build", description: "Pode alterar arquivos e rodar comandos (na pasta da mesa)" },
}

/** Destino do resumo ao integrar um fork. */
export const FORK_INTEGRATION_TARGETS = ["parent", "context", "planner", "reopen"] as const
export type ForkIntegrationTarget = (typeof FORK_INTEGRATION_TARGETS)[number]

export const FORK_INTEGRATION_TARGET_LABELS: Record<ForkIntegrationTarget, { label: string; description: string }> = {
    parent: { label: "Fork pai", description: "O resumo vira instrução durável da conversa do fork pai, sem disparar resposta." },
    context: { label: "Contexto da conversa principal", description: "O resumo vira instrução durável da sessão da mesa: o agente o considera nos próximos turnos, sem mudar a etapa." },
    planner: { label: "Enviar ao planejador", description: "O resumo vai ao planejador como correção e gera uma nova versão do plano." },
    reopen: { label: "Reabrir a mesa", description: "Reabre a mesa concluída e planeja de novo com o resumo." },
}

/** O que fazer com os forks em aberto quando a mesa conclui (configuração da central). */
export const FORK_DONE_POLICIES = ["conclude", "keep", "ask"] as const
export type ForkDonePolicy = (typeof FORK_DONE_POLICIES)[number]

export const FORK_DONE_POLICY_LABELS: Record<ForkDonePolicy, { label: string; description: string }> = {
    conclude: { label: "Concluir forks", description: "Ao concluir a mesa, os forks em aberto são concluídos (viram histórico somente leitura)." },
    keep: { label: "Não concluir", description: "Os forks continuam utilizáveis depois que a mesa conclui." },
    ask: { label: "Sempre perguntar", description: "A mesa concluída pergunta se os forks em aberto devem ser concluídos." },
}

/** Chat durante a execução numa central: segue o padrão global ou liga/desliga só nela. */
export const LIVE_CHAT_POLICIES = ["inherit", "on", "off"] as const
export type LiveChatPolicy = (typeof LIVE_CHAT_POLICIES)[number]

export const LIVE_CHAT_POLICY_LABELS: Record<LiveChatPolicy, string> = { inherit: "Padrão global", on: "Ligado", off: "Desligado" }

/** Explicação do chat durante a execução (configuração e campo da mensagem). */
export const LIVE_CHAT_DESCRIPTION = "Com o agente trabalhando (mesa, forks e refinamento), envie mensagens que entram na execução em andamento, sem interromper: o agente considera e segue."

/** Chaves das entradas duráveis de instrução das sessões do OpenCode. */
export const FORK_INSTRUCTIONS_KEY = "opex-fork"
export const FORK_NOTES_INSTRUCTIONS_KEY = "opex-fork-notes"
export const FORK_CHILD_NOTES_INSTRUCTIONS_KEY = "opex-fork-child-notes"
/** Memórias do agente desenvolvedor (globais + da central), regravadas a cada turno da mesa e do fork. */
export const DEVELOPER_MEMORIES_INSTRUCTIONS_KEY = "opex-developer-memories"

/**
 * Permissões da sessão de um fork em Plan (somente leitura): nega edição, subagentes e comandos, liberando
 * só os comandos de leitura. A última regra que casa vale (as liberações vêm depois do bloqueio geral).
 */
export const FORK_READ_ONLY_COMMANDS = ["git status*", "git log*", "git diff*", "git show*", "git branch*", "ls*", "cat *", "grep *", "rg *", "find *", "head *", "tail *", "wc *"] as const

export const FORK_READONLY_PERMISSIONS: readonly { action: string; resource: string; effect: "allow" | "deny" | "ask" }[] = [
    { action: "edit", resource: "*", effect: "deny" },
    { action: "task", resource: "*", effect: "deny" },
    { action: "bash", resource: "*", effect: "deny" },
    ...FORK_READ_ONLY_COMMANDS.map((resource) => ({ action: "bash", resource, effect: "allow" as const })),
]

/** Rotas da tela. */
export const DEV_CENTER_PATH = "/desenvolvimento"
export const workbenchPath = (taskId: string) => `${DEV_CENTER_PATH}/${taskId}`
export const centralSettingsPath = (centralId: string) => `/integracoes/ia/centrais/${centralId}`
export const AGENTIC_CENTRALS_HREF = "/integracoes/ia?aba=desenvolvimento-agentico&abaAgentic=centrais"
