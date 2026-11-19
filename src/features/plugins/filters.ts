import { urlFilterCodecs, type UrlFilterSchema } from "@/hooks/useUrlFilters"
import { PLUGIN_SCOPES, type PluginScope } from "./constants"
import { PLUGIN_SLOT_NODE_IDS, expandSlotSelection } from "./slot-tree"
import type { PluginDto } from "./types"

/** Filtros da tela de Plugins (na URL). Módulo PURO. */
export interface PluginFilters {
    q: string
    scopes: PluginScope[]
    /** Nós da árvore de slots: um slot ou uma área (cobre todos os slots abaixo dela). */
    slots: string[]
    /** Mostra também os arquivados (por padrão ficam fora). */
    showArchived: boolean
}

export const DEFAULT_PLUGIN_FILTERS: PluginFilters = { q: "", scopes: [], slots: [], showArchived: false }

export const PLUGIN_FILTER_SCHEMA: UrlFilterSchema<PluginFilters> = {
    q: urlFilterCodecs.string(),
    scopes: urlFilterCodecs.strings<PluginScope>(PLUGIN_SCOPES),
    slots: urlFilterCodecs.strings<string>(PLUGIN_SLOT_NODE_IDS),
    showArchived: urlFilterCodecs.boolean(),
}

const normalize = (value: string) =>
    value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()

/** Aplica arquivados, busca (nome, id, descrição, cliente), escopo e slot (área cobre os filhos). */
export function filterPlugins(plugins: readonly PluginDto[], filters: PluginFilters): PluginDto[] {
    const term = normalize(filters.q.trim())
    const slots = expandSlotSelection(filters.slots)
    return plugins.filter((plugin) => {
        if (!filters.showArchived && plugin.archivedAt) return false
        if (filters.scopes.length && !filters.scopes.includes(plugin.scope)) return false
        if (filters.slots.length && !plugin.slots.some((slot) => slots.has(slot))) return false
        if (!term) return true
        return [plugin.name, plugin.id, plugin.description, plugin.clientName ?? ""].some((field) => normalize(field).includes(term))
    })
}
