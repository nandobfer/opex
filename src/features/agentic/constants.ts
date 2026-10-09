/** Vocabulário do desenvolvimento agêntico (módulo puro: cliente e servidor). */

/** Etapas em que um agente do OpenCode é usado (cada uma com agente e modelo próprios). */
export const AGENT_ROLES = ["planning", "implementation", "build", "pr"] as const
export type AgentRole = (typeof AGENT_ROLES)[number]

export const AGENT_ROLE_LABELS: Record<AgentRole, { label: string; description: string }> = {
    planning: { label: "Planejamento", description: "Gera e corrige o plano (inclusive após correções da prévia e do PR)" },
    implementation: { label: "Implementação", description: "Cria o worktree, move a sessão e implementa o plano aprovado" },
    build: { label: "Build e ambiente", description: "Sobe a prévia com docker compose e, no fim, limpa o ambiente" },
    pr: { label: "Pull Request", description: "Valida, faz commit e push e abre o PR com o gh" },
}

/**
 * Etapas da mesa de trabalho. As "de execução" rodam um turno do agente; as demais esperam o
 * usuário (ou o PR, em `pr_open`).
 */
export const WORKBENCH_STAGES = [
    "planning",
    "plan_review",
    "implementing",
    "building",
    "preview",
    "opening_pr",
    "pr_open",
    "changes_requested",
    "finishing",
    "done",
] as const
export type WorkbenchStage = (typeof WORKBENCH_STAGES)[number]

export const RUNNING_STAGES: readonly WorkbenchStage[] = ["planning", "implementing", "building", "opening_pr", "finishing"]

export const WORKBENCH_STAGE_LABELS: Record<WorkbenchStage, string> = {
    planning: "Planejando",
    plan_review: "Plano pronto",
    implementing: "Implementando",
    building: "Subindo a prévia",
    preview: "Prévia pronta",
    opening_pr: "Abrindo o PR",
    pr_open: "PR aberto",
    changes_requested: "Mudanças pedidas no PR",
    finishing: "Concluindo",
    done: "Concluída",
}

/** Agente usado por etapa de execução. */
export const STAGE_ROLE: Partial<Record<WorkbenchStage, AgentRole>> = {
    planning: "planning",
    implementing: "implementation",
    building: "build",
    opening_pr: "pr",
    finishing: "build",
}

/** Passos exibidos no topo da mesa (várias etapas caem no mesmo passo). */
export const WORKBENCH_STEPS = [
    { id: "plan", label: "Plano", stages: ["planning", "plan_review"] },
    { id: "implement", label: "Implementação", stages: ["implementing"] },
    { id: "preview", label: "Prévia", stages: ["building", "preview"] },
    { id: "pr", label: "Pull Request", stages: ["opening_pr", "pr_open", "changes_requested"] },
    { id: "done", label: "Concluída", stages: ["finishing", "done"] },
] as const satisfies readonly { id: string; label: string; stages: readonly WorkbenchStage[] }[]

/** `idle`: parada esperando ação; `running`: turno do agente em andamento. */
export const RUN_STATES = ["idle", "running", "failed", "interrupted"] as const
export type RunState = (typeof RUN_STATES)[number]

/** Faixa de portas das prévias (docker compose). */
export const PREVIEW_PORT_MIN = 4001
export const PREVIEW_PORT_MAX = 4098

export const AGENTIC_AUDIT_CENTRAL = "CentralDesenvolvimento"
export const AGENTIC_AUDIT_WORKBENCH = "MesaDeTrabalho"
export const AGENTIC_FEATURE = "agentic-dev"

/** Evento em `private-app` quando uma central, uma mesa ou a configuração muda. */
export const AGENTIC_UPDATED_EVENT = "agentic-updated"

/** Escopo dos logs de uma central na integração "Provedores de IA" (`data.scope`). */
export const centralLogScope = (centralId: string) => `agentic:${centralId}`

/** Seções da tarefa enviadas ao planejamento. */
export const AGENTIC_INCLUDE_LABELS = {
    comments: { label: "Comentários", description: "Autor, data e texto de cada comentário" },
    history: { label: "Histórico", description: "Mudanças de status, responsável e campos" },
    plan: { label: "Plano do Go! Sipal", description: "Passos, complexidade e arquivos do plano cadastrado" },
} as const

/** Rotas da tela. */
export const DEV_CENTER_PATH = "/desenvolvimento"
export const workbenchPath = (centralId: string, taskId: string) => `${DEV_CENTER_PATH}/${centralId}/${taskId}`
export const centralSettingsPath = (centralId: string) => `/integracoes/ia/centrais/${centralId}`
