import { z } from "zod"
import { MEMORY_STATUSES } from "../constants"
import { DEFAULT_OVERVIEW_LAYOUT, OVERVIEW_LAYOUT_MODES } from "./overview-layout"
import type { NetworkMemory } from "./types"

/**
 * Busca e filtros da rede do Engramind (OPE-113, puro): no padrão de `/tarefas`, ficam no navegador
 * (`usePersistentState`, chave versionada) e **destacam sem remover** (as que não casam ficam apagadas).
 */

export const NETWORK_FILTERS_STORAGE_KEY = "opex.engramind.network-filters.v1"

const list = z.array(z.string().max(200)).max(200).catch([])
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).catch("")

export const networkFiltersSchema = z.object({
    search: z.string().max(500).catch(""),
    channels: list,
    statuses: list,
    categories: list,
    authors: list,
    /** Período (`yyyy-mm-dd`) pela última alteração da memória. */
    from: day,
    to: day,
    includeArchived: z.boolean().catch(false),
    /** Distribuição da visão inicial (escolhida na legenda; o Limpar não mexe). */
    overviewLayout: z.enum(OVERVIEW_LAYOUT_MODES).catch(DEFAULT_OVERVIEW_LAYOUT),
})

export type NetworkFilters = z.infer<typeof networkFiltersSchema>

export const DEFAULT_NETWORK_FILTERS: NetworkFilters = { search: "", channels: [], statuses: [], categories: [], authors: [], from: "", to: "", includeArchived: false, overviewLayout: DEFAULT_OVERVIEW_LAYOUT }

/** Campos que o "Limpar" zera (a distribuição escolhida no card "O que é o Engramind" fica). */
export const NETWORK_FILTER_KEYS = ["search", "channels", "statuses", "categories", "authors", "from", "to", "includeArchived"] as const satisfies readonly (keyof NetworkFilters)[]

export const clearNetworkFilters = (filters: NetworkFilters): NetworkFilters => ({ ...DEFAULT_NETWORK_FILTERS, overviewLayout: filters.overviewLayout })

/** Filtros que destacam memórias (sem a busca, que vem do servidor, e sem os arquivados). */
export const hasMemoryFilters = (filters: NetworkFilters): boolean => Boolean(filters.channels.length || filters.statuses.length || filters.categories.length || filters.authors.length || filters.from || filters.to)

export const hasActiveFilters = (filters: NetworkFilters, searchIds: ReadonlySet<string> | null): boolean => Boolean(searchIds) || hasMemoryFilters(filters)

const time = (iso: string) => new Date(iso).getTime()

/** A memória casa com a busca e os filtros? (Destaque: as demais ficam apagadas, nada sai da rede.) */
export function matchesFilters(memory: NetworkMemory, filters: NetworkFilters, searchIds: ReadonlySet<string> | null): boolean {
    if (searchIds && !searchIds.has(memory.id)) return false
    if (filters.channels.length && !filters.channels.includes(memory.channel)) return false
    if (filters.statuses.length && !filters.statuses.includes(memory.status)) return false
    if (filters.categories.length && !filters.categories.includes(memory.category)) return false
    if (filters.authors.length && !filters.authors.includes(memory.author ?? "")) return false
    const updated = time(memory.updatedAt)
    if (filters.from && !(updated >= time(`${filters.from}T00:00:00`))) return false
    if (filters.to && !(updated <= time(`${filters.to}T23:59:59.999`))) return false
    return true
}

const STATUS_LABEL: Record<string, string> = { active: "Ativa", permanent: "Fixada", archived: "Inativa" }
export const memoryStatusLabel = (status: string) => STATUS_LABEL[status] ?? status
export const MEMORY_STATUS_OPTIONS = MEMORY_STATUSES.map((value) => ({ value, label: memoryStatusLabel(value) }))

export interface NetworkFilterChip {
    key: string
    label: string
    remove: Partial<NetworkFilters>
}

const formatDay = (value: string) => value.split("-").reverse().join("/")

/**
 * Chips dos filtros ativos (resumo do cartão recolhido e contagem da gaveta no celular). `channelLabel`
 * mostra o canal legível (`channelDisplayName`: sigla da central no lugar do id).
 */
export function activeNetworkFilterChips(filters: NetworkFilters, channelLabel: (slug: string) => string = (slug) => slug): NetworkFilterChip[] {
    const chips: NetworkFilterChip[] = []
    if (filters.search.trim()) chips.push({ key: "search", label: `Busca: ${filters.search.trim()}`, remove: { search: "" } })
    const many = (key: "channels" | "statuses" | "categories" | "authors", title: string, label: (value: string) => string = (value) => value) => {
        for (const value of filters[key]) chips.push({ key: `${key}:${value}`, label: `${title}: ${label(value)}`, remove: { [key]: filters[key].filter((item) => item !== value) } })
    }
    many("channels", "Canal", channelLabel)
    many("statuses", "Status", memoryStatusLabel)
    many("categories", "Categoria")
    many("authors", "Autor")
    if (filters.from || filters.to) {
        const label = filters.from && filters.to ? `${formatDay(filters.from)} a ${formatDay(filters.to)}` : filters.from ? `desde ${formatDay(filters.from)}` : `até ${formatDay(filters.to)}`
        chips.push({ key: "period", label: `Período: ${label}`, remove: { from: "", to: "" } })
    }
    if (filters.includeArchived) chips.push({ key: "archived", label: "Mostrando arquivados", remove: { includeArchived: false } })
    return chips
}
