/**
 * Vocabulário das tarefas dO Opex. Módulo PURO (cliente e servidor). As tarefas são locais: o
 * Opex é a fonte de verdade, então não há espelho de plataforma externa nem regras de transição.
 */

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

/** Cor do ícone de prioridade sem rótulo (rodapé do card do kanban): fundo translúcido + cor do ícone. */
export const TASK_PRIORITY_ICON_STYLES: Record<TaskPriority, string> = {
    urgent: "bg-red-500/15 text-red-300",
    high: "bg-orange-500/15 text-orange-300",
    medium: "bg-sky-500/10 text-sky-300",
    low: "bg-zinc-500/10 text-zinc-300",
}

/** Ordenação dos cards dentro da coluna. */
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

/** Evento Pusher (canal `private-app`) quando tarefas mudam. Payload: `{ ids: string[] }`. */
export const TASKS_UPDATED_EVENT = "tasks-updated"

/** Evento Pusher (canal `private-app`) quando as colunas/ordem do quadro mudam. */
export const TASK_COLUMNS_UPDATED_EVENT = "task-columns-updated"

export const TASKS_PATH = "/tarefas"
export const TASK_NEW_PATH = "/tarefas/nova"
/** Prévia de tarefa do dono (mesmo fluxo do portal do cliente: rascunho → IA → revisão → aprovar). */
export const TASK_PREVIEW_PATH = "/tarefas/previa"
export const taskPath = (id: string) => `${TASKS_PATH}/${id}`
export const taskPreviewPath = (id: string) => `${TASK_PREVIEW_PATH}/${id}`
