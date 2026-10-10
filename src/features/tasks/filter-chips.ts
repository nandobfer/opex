import { TASK_PRIORITY_LABELS, TASK_SORT_LABELS, TASK_TYPE_LABELS } from "./constants"
import { DEFAULT_TASK_FILTERS, type TaskFilters } from "./filters"

/**
 * Chips do resumo dos filtros de Tarefas (`ListFilters` recolhido). Módulo puro: recebe os nomes
 * já resolvidos e devolve rótulo, texto completo e o patch que remove o filtro.
 */

export interface TaskFilterChip {
    key: string
    label: string
    title: string
    /** O que aplicar nos filtros para remover este chip. */
    remove: Partial<TaskFilters>
    /** Preferência (ordenação), não filtro. */
    subtle?: boolean
}

export interface TaskFilterChipContext {
    /** id → repositório (`owner/repo`) e chave → nome (colunas). */
    projects: ReadonlyMap<string, string>
    columns: ReadonlyMap<string, string>
}

/** Valores além deste limite viram "N selecionados" (a lista completa fica no `title`). */
export const CHIP_MAX_NAMES = 2

function valuesLabel(names: readonly string[]): string {
    return names.length > CHIP_MAX_NAMES ? `${names.length} selecionados` : names.join(", ")
}

function multi(key: keyof TaskFilters, title: string, names: string[]): TaskFilterChip | null {
    if (names.length === 0) return null
    return { key, label: `${title}: ${valuesLabel(names)}`, title: `${title}: ${names.join(", ")}`, remove: { [key]: [] } as Partial<TaskFilters> }
}

const nameOf = (map: ReadonlyMap<string, string>, id: string) => map.get(id) ?? "Desconhecido"

export function activeTaskFilterChips(filters: TaskFilters, ctx: TaskFilterChipContext): TaskFilterChip[] {
    const chips: (TaskFilterChip | null)[] = []
    const search = filters.search.trim()
    if (search) chips.push({ key: "search", label: `Busca: "${search}"`, title: `Busca: "${search}"`, remove: { search: "" } })

    chips.push(multi("projects", "Repositório", filters.projects.map((id) => nameOf(ctx.projects, id))))
    chips.push(multi("columns", "Coluna", filters.columns.filter((key) => ctx.columns.has(key)).map((key) => ctx.columns.get(key)!)))
    chips.push(multi("priorities", "Prioridade", filters.priorities.map((value) => TASK_PRIORITY_LABELS[value])))
    chips.push(multi("types", "Tipo", filters.types.map((value) => TASK_TYPE_LABELS[value])))
    if (filters.showArchived) chips.push({ key: "showArchived", label: "Arquivadas: mostrando", title: "Mostrando tarefas arquivadas", remove: { showArchived: false } })
    if (filters.sort !== DEFAULT_TASK_FILTERS.sort) {
        const label = `Ordem: ${TASK_SORT_LABELS[filters.sort]}`
        chips.push({ key: "sort", label, title: `${label} (padrão: ${TASK_SORT_LABELS[DEFAULT_TASK_FILTERS.sort]})`, remove: { sort: DEFAULT_TASK_FILTERS.sort }, subtle: true })
    }
    return chips.filter((chip): chip is TaskFilterChip => chip !== null)
}
