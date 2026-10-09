/**
 * Vocabulário das tarefas do Centro de Desenvolvimento do Go! Sipal. Módulo PURO (cliente e
 * servidor). Espelha `lib/constants/devTask.ts`, `lib/services/devTaskService.ts`
 * (`validateTaskTransition`) e `lib/utils/urlValidation.ts` de `~/code/sap-painel-lancamento` —
 * ao mudar lá, atualize aqui.
 */

export const TASK_STATUSES = [
    "backlog",
    "prioritized",
    "specification",
    "development",
    "validation",
    "awaiting_production",
    "in_production",
] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
    backlog: "Backlog",
    prioritized: "Priorizado",
    specification: "Especificação",
    development: "Desenvolvimento",
    validation: "Validação",
    awaiting_production: "Aguardando Produção",
    in_production: "Em Produção",
}

/** Faixa da coluna/indicador do status (tokens do Tailwind, legíveis no tema escuro). */
export const TASK_STATUS_ACCENT: Record<TaskStatus, { border: string; dot: string }> = {
    backlog: { border: "border-t-zinc-400", dot: "bg-zinc-400" },
    prioritized: { border: "border-t-sky-400", dot: "bg-sky-400" },
    specification: { border: "border-t-violet-400", dot: "bg-violet-400" },
    development: { border: "border-t-yellow-400", dot: "bg-yellow-400" },
    validation: { border: "border-t-orange-400", dot: "bg-orange-400" },
    awaiting_production: { border: "border-t-cyan-400", dot: "bg-cyan-400" },
    in_production: { border: "border-t-emerald-400", dot: "bg-emerald-400" },
}

/** Estado final: a plataforma não deixa sair de "Em Produção". */
export const FINAL_TASK_STATUS: TaskStatus = "in_production"

/** Colunas que a plataforma devolve limitadas (200 tarefas cada). */
export const LIMITED_TASK_STATUSES: readonly TaskStatus[] = ["backlog", "in_production"]
export const PLATFORM_COLUMN_LIMIT = 200

export const TASK_TYPES = ["analysis", "feature", "bugfix", "automation", "testing", "devops"] as const
export type TaskType = (typeof TASK_TYPES)[number]

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
    analysis: "Análise e Especificação",
    feature: "Nova Funcionalidade",
    bugfix: "Correção",
    automation: "Automação",
    testing: "Testes",
    devops: "DevOps",
}

export const TASK_TYPE_SHORT_LABELS: Record<TaskType, string> = {
    analysis: "Análise",
    feature: "Feature",
    bugfix: "Correção",
    automation: "Automação",
    testing: "Testes",
    devops: "DevOps",
}

export const TASK_TYPE_STYLES: Record<TaskType, string> = {
    analysis: "border-indigo-400/30 bg-indigo-500/15 text-indigo-300",
    feature: "border-emerald-400/30 bg-emerald-500/15 text-emerald-300",
    bugfix: "border-red-400/30 bg-red-500/15 text-red-300",
    automation: "border-violet-400/30 bg-violet-500/15 text-violet-300",
    testing: "border-teal-400/30 bg-teal-500/15 text-teal-300",
    devops: "border-amber-400/30 bg-amber-500/15 text-amber-300",
}

/** Tipos sem código: não exigem URL de commit/PR para avançar. */
export const NON_CODE_TASK_TYPES: readonly TaskType[] = ["analysis", "automation", "testing", "devops"]

export const TASK_PRIORITIES = ["urgent", "high", "medium", "low"] as const
export type TaskPriority = (typeof TASK_PRIORITIES)[number]

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
    urgent: "Urgente",
    high: "Alta",
    medium: "Média",
    low: "Baixa",
}

export const TASK_PRIORITY_RANK: Record<TaskPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 }

export const TASK_PRIORITY_STYLES: Record<TaskPriority, string> = {
    urgent: "border-red-400/40 bg-red-500/15 text-red-300",
    high: "border-orange-400/40 bg-orange-500/15 text-orange-300",
    medium: "border-sky-400/30 bg-sky-500/10 text-sky-300",
    low: "border-zinc-400/30 bg-zinc-500/10 text-zinc-300",
}

export function isTaskStatus(value: unknown): value is TaskStatus {
    return TASK_STATUSES.includes(value as TaskStatus)
}

export function isNonCodeTaskType(type: string | null | undefined): boolean {
    return NON_CODE_TASK_TYPES.includes(type as TaskType)
}

/** Link de commit (GitHub, GitLab ou Bitbucket). */
export function isValidCommitUrl(url: string): boolean {
    const value = url.trim()
    return /^https?:\/\//i.test(value) && (/\/(commit|commits)\/[a-f0-9]+/i.test(value) || /\/c\/[a-f0-9]+/i.test(value))
}

/** Pull Request do GitHub ou Merge Request do GitLab. */
export function isValidPullRequestUrl(url: string): boolean {
    return /^https:\/\/(github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+|gitlab\.com\/[\w.-]+\/[\w.-]+\/-\/merge_requests\/\d+)/.test(url.trim())
}

export type RequiredUrl = "commit" | "pullRequest"

/**
 * URL exigida pela plataforma para levar a tarefa ao status alvo (`null` = nenhuma ou já tem uma
 * válida). Mesma regra de `validateTaskTransition`.
 */
export function requiredUrlFor(
    task: { taskType: string | null; commitUrl: string | null; pullRequestUrl: string | null },
    target: TaskStatus,
): RequiredUrl | null {
    if (isNonCodeTaskType(task.taskType)) return null
    if (target === "validation" && !(task.commitUrl && isValidCommitUrl(task.commitUrl))) return "commit"
    if (target === "awaiting_production" && !(task.pullRequestUrl && isValidPullRequestUrl(task.pullRequestUrl))) return "pullRequest"
    return null
}

/** Ordenação dos cards dentro da coluna (igual às opções da plataforma). */
export const TASK_SORT_KEYS = ["priority", "manual", "newest", "oldest"] as const
export type TaskSortKey = (typeof TASK_SORT_KEYS)[number]

export const TASK_SORT_LABELS: Record<TaskSortKey, string> = {
    priority: "Prioridade",
    manual: "Manual (arrastar)",
    newest: "Mais recentes",
    oldest: "Mais antigas",
}

export const TASK_VIEW_MODES = ["kanban", "table"] as const
export type TaskViewMode = (typeof TASK_VIEW_MODES)[number]

/** Valor do filtro de responsável para "sem responsável". */
export const UNASSIGNED = "__none__"

/** Evento Pusher (canal `private-app`) quando tarefas mudam. Payload: `{ ids: string[] }`. */
export const TASKS_UPDATED_EVENT = "tasks-updated"

/** Evento Pusher (canal `private-app`) quando colunas customizadas/ordem do quadro mudam. */
export const TASK_COLUMNS_UPDATED_EVENT = "task-columns-updated"

export const TASKS_PATH = "/tarefas"
export const taskPath = (id: string) => `${TASKS_PATH}/${id}`

/** Link da tarefa na interface do Go! Sipal. */
export function goSipalTaskUrl(baseUrl: string, id: string): string {
    return `${baseUrl.replace(/\/+$/, "")}/dev-center?task=${encodeURIComponent(id)}`
}
