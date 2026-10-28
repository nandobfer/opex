import { CHIP_MAX_NAMES } from "@/features/tasks/filter-chips"
import { DEFAULT_DEV_CENTER_FILTERS, DEV_CENTER_STATE_LABELS, type DevCenterFilters } from "./dev-center-filters"

/**
 * Chips do resumo dos filtros recolhidos da coluna Tarefas da Central de desenvolvimento. Módulo
 * puro: só os filtros que diferem do padrão viram chip, cada um com o patch que o remove.
 */

export interface DevCenterFilterChip {
    key: string
    label: string
    title: string
    /** O que aplicar nos filtros para remover este chip; `null` = chip do projeto (volta para "Todos os projetos"). */
    remove: Partial<DevCenterFilters> | null
}

export interface DevCenterFilterChipContext {
    /** Chave da coluna → rótulo. */
    columns: ReadonlyMap<string, string>
    /** Nome do projeto escolhido; `null` = "Todos os projetos" (padrão, sem chip). */
    centralName: string | null
}

function valuesLabel(names: readonly string[]): string {
    return names.length > CHIP_MAX_NAMES ? `${names.length} selecionados` : names.join(", ")
}

/** Todas as colunas valem (padrão): nenhuma escolhida ou todas marcadas. */
const allColumns = (filters: DevCenterFilters) => filters.allColumns ?? filters.columns.length === 0

export function activeDevCenterFilterChips(filters: DevCenterFilters, ctx: DevCenterFilterChipContext): DevCenterFilterChip[] {
    const chips: DevCenterFilterChip[] = []
    if (ctx.centralName) chips.push({ key: "central", label: `Projeto: ${ctx.centralName}`, title: `Projeto: ${ctx.centralName}`, remove: null })
    if (filters.activeOnly) chips.push({ key: "activeOnly", label: "Só mesas ativas", title: "Só mesas ativas", remove: { activeOnly: false } })
    if (!allColumns(filters)) {
        const names = filters.columns.map((key) => ctx.columns.get(key) ?? key)
        // Nenhuma coluna = nenhuma tarefa; o × volta ao padrão (todas), não esvazia.
        const label = names.length ? `Colunas: ${valuesLabel(names)}` : "Colunas: nenhuma"
        chips.push({ key: "columns", label, title: names.length ? `Colunas: ${names.join(", ")}` : label, remove: { columns: [...DEFAULT_DEV_CENTER_FILTERS.columns], allColumns: undefined } })
    }
    if (filters.states.length) {
        const names = filters.states.map((state) => DEV_CENTER_STATE_LABELS[state])
        chips.push({ key: "states", label: `Estado: ${valuesLabel(names)}`, title: `Estado: ${names.join(", ")}`, remove: { states: [] } })
    }
    const search = filters.search.trim()
    if (search) chips.push({ key: "search", label: `Busca: "${search}"`, title: `Busca: "${search}"`, remove: { search: "" } })
    return chips
}
