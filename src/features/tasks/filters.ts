import Fuse from "fuse.js"
import { z } from "zod"
import { TASK_PRIORITIES, TASK_SORT_KEYS, TASK_TYPES, TASK_VIEW_MODES, type TaskPriority, type TaskSortKey, type TaskType, type TaskViewMode } from "./constants"
import { columnKeyOf, type BoardColumnView } from "./board"
import type { ProjectRef } from "./types"

/** Filtros e preferências da tela de Tarefas (salvos no navegador). Módulo puro. */

export const TASK_FILTERS_STORAGE_KEY = "opex:tasks-filters:v1"

export interface TaskFilters {
    search: string
    /** Ids dos projetos (repositórios vinculados). */
    projects: string[]
    /** Chaves de coluna. */
    columns: string[]
    priorities: TaskPriority[]
    types: TaskType[]
    showArchived: boolean
    view: TaskViewMode
    sort: TaskSortKey
    tableSort: { column: TaskTableColumn; direction: "asc" | "desc" }
}

export const TASK_TABLE_COLUMNS = ["code", "issue", "title", "column", "priority", "type", "project", "updatedAt"] as const
export type TaskTableColumn = (typeof TASK_TABLE_COLUMNS)[number]

export const DEFAULT_TASK_FILTERS: TaskFilters = {
    search: "",
    projects: [],
    columns: [],
    priorities: [],
    types: [],
    showArchived: false,
    view: "kanban",
    sort: "priority",
    tableSort: { column: "updatedAt", direction: "desc" },
}

/** Campos que contam como "filtro" (Limpar zera só estes; visão e ordenação ficam). */
export const TASK_FILTER_KEYS = ["search", "projects", "columns", "priorities", "types", "showArchived"] as const

const list = <T extends string>(values: readonly T[]) => z.array(z.enum(values as unknown as [T, ...T[]])).catch([])

/** Valida o que veio do `localStorage`: campo inválido volta ao padrão, sem perder os demais. */
export const taskFiltersSchema = z.object({
    search: z.string().max(200).catch(DEFAULT_TASK_FILTERS.search),
    projects: z.array(z.string()).catch([]),
    columns: z.array(z.string().max(60)).catch([]),
    priorities: list(TASK_PRIORITIES),
    types: list(TASK_TYPES),
    showArchived: z.boolean().catch(false),
    view: z.enum(TASK_VIEW_MODES).catch(DEFAULT_TASK_FILTERS.view),
    sort: z.enum(TASK_SORT_KEYS).catch(DEFAULT_TASK_FILTERS.sort),
    tableSort: z.object({ column: z.enum(TASK_TABLE_COLUMNS), direction: z.enum(["asc", "desc"]) }).catch(DEFAULT_TASK_FILTERS.tableSort),
}) satisfies z.ZodType<TaskFilters, unknown>

export function countActiveFilters(filters: TaskFilters): number {
    return TASK_FILTER_KEYS.filter((key) => {
        const value = filters[key]
        return Array.isArray(value) ? value.length > 0 : Boolean(value)
    }).length
}

/** Opção do filtro Repositório: `value` é o id do projeto (o repositório vinculado). */
export interface TaskRepoOption {
    value: string
    label: string
    project: ProjectRef
}

/**
 * Campos que os filtros leem de uma tarefa (serve à lista interna e à do portal do cliente, que
 * têm estimativas diferentes).
 */
export interface FilterableTask {
    code: string
    title: string
    archived: boolean
    priority: TaskPriority
    taskType: TaskType | null
    columnId: string
    project: ProjectRef | null
}

/**
 * Repositórios do filtro de Tarefas: os projetos vinculados mais os citados nas tarefas (garante
 * que nenhum repositório fique de fora antes de `options` carregar). `label` = `owner/repo`.
 */
export function taskRepoOptions(projects: readonly ProjectRef[], tasks: readonly FilterableTask[]): TaskRepoOption[] {
    const byId = new Map<string, ProjectRef>()
    for (const project of projects) byId.set(project.id, project)
    for (const task of tasks) if (task.project) byId.set(task.project.id, task.project)
    return [...byId.values()]
        .map((project) => ({ value: project.id, label: project.repo, project }))
        .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"))
}

const includesOrAll = <T>(selected: readonly T[], value: T) => selected.length === 0 || selected.includes(value)

/**
 * Filtros aplicados no navegador (a lista vem inteira do servidor). Coluna filtra a tabela; no
 * kanban esconde as colunas (ver `visibleColumns`). Busca tolera erro de digitação (fuse.js) e casa
 * código exato (ex.: "OPX-12").
 */
export function applyTaskFilters<T extends FilterableTask>(tasks: readonly T[], filters: TaskFilters, options: { ignoreColumn?: boolean } = {}): T[] {
    let result = tasks.filter(
        (task) =>
            (filters.showArchived || !task.archived) &&
            includesOrAll(filters.projects, task.project?.id ?? "") &&
            (options.ignoreColumn || includesOrAll(filters.columns, columnKeyOf(task))) &&
            includesOrAll(filters.priorities, task.priority) &&
            (filters.types.length === 0 || (task.taskType !== null && filters.types.includes(task.taskType))),
    )

    const term = filters.search.trim()
    if (term) {
        const exact = term.toLowerCase()
        const byCode = result.filter((task) => task.code.toLowerCase().includes(exact))
        if (byCode.length) {
            result = byCode
        } else {
            const fuse = new Fuse(result, { keys: ["title", "code"], threshold: 0.4, ignoreLocation: true })
            const matched = new Set(fuse.search(term).map((hit) => hit.item))
            result = result.filter((task) => matched.has(task))
        }
    }
    return result
}

/** Colunas do kanban: todas, ou só as escolhidas no filtro Coluna (chaves que sumiram são ignoradas). */
export function visibleColumns(columns: readonly BoardColumnView[], filters: TaskFilters): BoardColumnView[] {
    const chosen = filters.columns.filter((key) => columns.some((column) => column.key === key))
    return chosen.length ? columns.filter((column) => chosen.includes(column.key)) : [...columns]
}

/** Filtro Coluna sem chaves que não existem mais. */
export function knownColumns(columns: readonly BoardColumnView[], keys: readonly string[]): string[] {
    return keys.filter((key) => columns.some((column) => column.key === key))
}
