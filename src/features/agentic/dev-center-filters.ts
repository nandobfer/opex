import { z } from "zod"
import type { TaskDto } from "@/features/tasks/types"

/** Filtros da lista de tarefas da Central de desenvolvimento (persistidos no navegador). */

export const DEV_CENTER_FILTERS_KEY = "opex:dev-center-filters:v1"

export const devCenterFiltersSchema = z.object({
    search: z.string().max(200),
    columns: z.array(z.string().max(60)).max(100),
})
export type DevCenterFilters = z.infer<typeof devCenterFiltersSchema>

/** Padrão: tudo (nenhuma coluna escolhida). */
export const DEFAULT_DEV_CENTER_FILTERS: DevCenterFilters = {
    search: "",
    columns: [],
}

const normalize = (value: string) =>
    value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()

/** Tarefas do projeto que passam nos filtros, na ordem do quadro. */
export function filterCentralTasks(tasks: readonly TaskDto[], projectId: string, filters: DevCenterFilters): TaskDto[] {
    const terms = normalize(filters.search).split(/\s+/).filter(Boolean)
    const columns = new Set(filters.columns)
    return tasks
        .filter((task) => !task.archived && task.project?.id === projectId)
        .filter((task) => columns.size === 0 || columns.has(task.columnId))
        .filter((task) => {
            if (!terms.length) return true
            const haystack = normalize(`${task.code} ${task.title}`)
            return terms.every((term) => haystack.includes(term))
        })
        .sort((a, b) => a.order - b.order)
}
