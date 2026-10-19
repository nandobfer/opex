/** Vocabulário do desenvolvimento agêntico (módulo puro: cliente e servidor). */

/** Etapas em que um agente do OpenCode é usado (cada uma com agente e modelo próprios). */
export const AGENT_ROLES = ["planning", "implementation", "build", "pr", "fork"] as const
export type AgentRole = (typeof AGENT_ROLES)[number]

export const AGENT_ROLE_LABELS: Record<AgentRole, { label: string; description: string }> = {
    planning: { label: "Planejamento", description: "Gera e corrige o plano (inclusive após correções da prévia e do PR)" },
    implementation: { label: "Implementação", description: "Cria o worktree, move a sessão e implementa o plano aprovado" },
    build: { label: "Build e ambiente", description: "Sobe a prévia com docker compose e, no fim, limpa o ambiente" },
    pr: { label: "Pull Request", description: "Valida, faz commit e push e abre o PR com o gh" },
    fork: { label: "Fork da conversa", description: "Responde nos forks da conversa (somente leitura) e consolida o resumo para integrar" },
}

/**
 * Etapas da mesa de trabalho. As "de execução" rodam um turno do agente; as demais esperam o
 * usuário (ou o PR, em `pr_open`).
 */
export const WORKBENCH_STAGES = [
    "planning",
    "plan_review",
    "implementing",
    "build_queued",
    "building",
    "preview",
    "opening_pr",
    "pr_open",
    "changes_requested",
    "resolving_conflicts",
    "merging_pr",
    "deleting_pr_branch",
    "finishing",
    "done",
] as const
export type WorkbenchStage = (typeof WORKBENCH_STAGES)[number]

export const RUNNING_STAGES: readonly WorkbenchStage[] = ["planning", "implementing", "building", "opening_pr", "resolving_conflicts", "merging_pr", "deleting_pr_branch", "finishing"]

/**
 * Etapas que NÃO ocupam vaga no limite de mesas da central (`maxConcurrent`): a mesa espera o
 * usuário (plano/prévia) ou o PR. Ao sair delas para executar, a mesa aguarda vaga se o limite estiver cheio.
 */
export const SLOT_EXEMPT_STAGES: readonly WorkbenchStage[] = ["plan_review", "preview", "pr_open"]

/** O que uma mesa aguardando vaga vai executar quando a vaga chegar. */
export const PENDING_TURN_ACTIONS = ["revise-plan", "implement", "request-correction", "approve", "submit-pr-feedback", "reopen", "pr-feedback", "pr-conflict", "pr-auto-merge", "pr-cleanup"] as const
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
    "pr-auto-merge": "Mergear o PR",
    "pr-cleanup": "Limpar o ambiente após o merge",
}

export const WORKBENCH_STAGE_LABELS: Record<WorkbenchStage, string> = {
    planning: "Planejando",
    plan_review: "Plano pronto",
    implementing: "Implementando",
    build_queued: "Na fila do build",
    building: "Subindo a prévia",
    preview: "Prévia pronta",
    opening_pr: "Abrindo o PR",
    pr_open: "PR aberto",
    changes_requested: "Mudanças pedidas no PR",
    resolving_conflicts: "Resolvendo conflitos",
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
    merging_pr: "pr",
    deleting_pr_branch: "pr",
    finishing: "build",
}

/** Passos exibidos no topo da mesa (várias etapas caem no mesmo passo). */
export const WORKBENCH_STEPS = [
    { id: "plan", label: "Plano", stages: ["planning", "plan_review"] },
    { id: "implement", label: "Implementação", stages: ["implementing"] },
    { id: "preview", label: "Prévia", stages: ["build_queued", "building", "preview"] },
    { id: "pr", label: "Pull Request", stages: ["opening_pr", "pr_open", "changes_requested", "resolving_conflicts", "merging_pr", "deleting_pr_branch"] },
    { id: "done", label: "Concluída", stages: ["finishing", "done"] },
] as const satisfies readonly { id: string; label: string; stages: readonly WorkbenchStage[] }[]

/** `idle`: parada esperando ação; `running`: turno do agente em andamento. */
export const RUN_STATES = ["idle", "running", "failed", "interrupted"] as const
export type RunState = (typeof RUN_STATES)[number]

/** Faixa padrão de portas das prévias (docker compose); cada central pode configurar a sua. */
export const PREVIEW_PORT_MIN = 4001
export const PREVIEW_PORT_MAX = 4098

/** Raiz dos repositórios na máquina (usada para sugerir o diretório das sessões ao criar uma central). */
export const AGENTIC_CODE_ROOT = "/home/burgos/code"

export const AGENTIC_AUDIT_CENTRAL = "CentralDesenvolvimento"
export const AGENTIC_AUDIT_WORKBENCH = "MesaDeTrabalho"
export const AGENTIC_AUDIT_FORK = "ForkDaMesa"
export const AGENTIC_FEATURE = "agentic-dev"

/** Evento em `private-app` quando uma central, uma mesa ou a configuração muda. */
export const AGENTIC_UPDATED_EVENT = "agentic-updated"

/** Escopo dos logs de uma central na integração "Provedores de IA" (`data.scope`). */
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

/** Chaves das entradas duráveis de instrução das sessões do OpenCode. */
export const FORK_INSTRUCTIONS_KEY = "opex-fork"
export const FORK_NOTES_INSTRUCTIONS_KEY = "opex-fork-notes"
export const FORK_CHILD_NOTES_INSTRUCTIONS_KEY = "opex-fork-child-notes"

/**
 * Permissões da sessão de um fork (somente leitura): nega edição, subagentes e comandos, liberando
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
