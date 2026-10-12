import { TASK_TYPES, TASK_TYPE_LABELS, type TaskType } from "@/features/tasks/constants"
import { urlFilterCodecs, type UrlFilterCodec, type UrlFilterSchema } from "@/hooks/useUrlFilters"
import { PROJECT_ID_PATTERN } from "./schemas"

/**
 * Filtros das Horas agênticas (`/tarefas/horas`): período + repositórios + tipos de tarefa. O
 * período e as duas listas vivem na URL (`useUrlFilters`) e são enviados à API, que faz o recorte.
 * Módulo puro.
 */

export interface TimeLogFilters {
    /** Início do período (`yyyy-MM-dd`; vazio = sem início). */
    from: string
    /** Fim do período (`yyyy-MM-dd`; vazio = sem fim). */
    to: string
    /** Ids dos projetos (repositórios vinculados). */
    projects: string[]
    /** Tipos de tarefa. */
    types: TaskType[]
}

/** Ids de projeto da URL: só os bem formados sobrevivem (a API valida a mesma regra). */
const projectIds: UrlFilterCodec<string[]> = {
    parse: (raw, fallback) => (raw === null ? fallback : raw.split(",").map((value) => value.trim()).filter((value) => PROJECT_ID_PATTERN.test(value))),
    serialize: (value) => value.join(","),
}

export const TIME_LOG_FILTER_SCHEMA: UrlFilterSchema<TimeLogFilters> = {
    from: urlFilterCodecs.string(),
    to: urlFilterCodecs.string(),
    projects: projectIds,
    types: urlFilterCodecs.strings<TaskType>(TASK_TYPES),
}

/** Opções do filtro Tipo (o vocabulário das tarefas). */
export const TIME_LOG_TYPE_OPTIONS: readonly { value: TaskType; label: string }[] = TASK_TYPES.map((value) => ({
    value,
    label: TASK_TYPE_LABELS[value],
}))

/** Há recorte além do período? Decide o estado vazio e o rótulo da ação de limpar. */
export function hasTimeLogFilters(filters: Pick<TimeLogFilters, "projects" | "types">): boolean {
    return filters.projects.length > 0 || filters.types.length > 0
}
