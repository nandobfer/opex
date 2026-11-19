import { urlFilterCodecs, type UrlFilterSchema } from "@/hooks/useUrlFilters"
import { PLUGIN_SCOPES, type PluginScope } from "./constants"
import type { PluginDto } from "./types"

/** Filtros da tela de Plugins (na URL). Módulo PURO. */
export interface PluginFilters {
    q: string
    scopes: PluginScope[]
}

export const DEFAULT_PLUGIN_FILTERS: PluginFilters = { q: "", scopes: [] }

export const PLUGIN_FILTER_SCHEMA: UrlFilterSchema<PluginFilters> = {
    q: urlFilterCodecs.string(),
    scopes: urlFilterCodecs.strings<PluginScope>(PLUGIN_SCOPES),
}

const normalize = (value: string) =>
    value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()

/** Aplica busca (nome, id, descrição, cliente) e escopo. */
export function filterPlugins(plugins: readonly PluginDto[], filters: PluginFilters): PluginDto[] {
    const term = normalize(filters.q.trim())
    return plugins.filter((plugin) => {
        if (filters.scopes.length && !filters.scopes.includes(plugin.scope)) return false
        if (!term) return true
        return [plugin.name, plugin.id, plugin.description, plugin.clientName ?? ""].some((field) => normalize(field).includes(term))
    })
}
