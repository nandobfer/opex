import { z } from "zod"
import { TASK_STATUSES, type TaskStatus } from "@/features/tasks/constants"
import type { TaskDto } from "@/features/tasks/types"

/** Filtros da lista de tarefas da Central de desenvolvimento (persistidos no navegador). */

export const DEV_CENTER_FILTERS_KEY = "opex:dev-center-filters:v1"

/** `null` em `assignee` = todos; `"none"` = sem responsável. */
export const devCenterFiltersSchema = z.object({
    search: z.string().max(200),
    statuses: z.array(z.enum(TASK_STATUSES)).max(TASK_STATUSES.length),
    assignee: z.string().max(40).nullable(),
})
export type DevCenterFilters = z.infer<typeof devCenterFiltersSchema>

/** Padrão: o que ainda está em trabalho (sem Em Produção). */
export const DEFAULT_DEV_CENTER_FILTERS: DevCenterFilters = {
    search: "",
    statuses: ["backlog", "prioritized", "specification", "development", "validation", "awaiting_production"],
    assignee: null,
}

export const UNASSIGNED = "none"

const normalize = (value: string) =>
    value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()

/** Tarefas do produto que passam nos filtros, na ordem do status (fluxo) e do quadro. */
export function filterCentralTasks(tasks: readonly TaskDto[], productId: string, filters: DevCenterFilters): TaskDto[] {
    const terms = normalize(filters.search).split(/\s+/).filter(Boolean)
    const statuses = new Set<TaskStatus>(filters.statuses)
    return tasks
        .filter((task) => !task.draft && !task.archived && task.product?.id === productId)
        .filter((task) => statuses.size === 0 || statuses.has(task.status))
        .filter((task) => (filters.assignee === null ? true : filters.assignee === UNASSIGNED ? !task.assignee : task.assignee?.id === filters.assignee))
        .filter((task) => {
            if (!terms.length) return true
            const haystack = normalize(`${task.code} ${task.title}`)
            return terms.every((term) => haystack.includes(term))
        })
        .sort((a, b) => TASK_STATUSES.indexOf(a.status) - TASK_STATUSES.indexOf(b.status) || a.order - b.order)
}

/** Responsáveis presentes nas tarefas do produto (para o filtro). */
export function assigneesOf(tasks: readonly TaskDto[], productId: string): { id: string; name: string }[] {
    const map = new Map<string, string>()
    for (const task of tasks) if (task.product?.id === productId && task.assignee) map.set(task.assignee.id, task.assignee.name)
    return [...map].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
}
