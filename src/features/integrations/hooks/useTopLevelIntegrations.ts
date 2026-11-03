"use client"

import { useIntegrations } from "./useIntegrations"
import { useIntegrationStatusLive } from "./useIntegrationStatusLive"

/**
 * Integrações da lista principal (`/integracoes` e o submenu da sidebar), na ordem da API, com o
 * status ao vivo. Integrações-filhas (provedores de IA) ficam fora: aparecem só dentro da página da mãe.
 */
export function useTopLevelIntegrations() {
    const query = useIntegrations()
    const integrations = (query.data ?? []).filter((integration) => !integration.parent)
    useIntegrationStatusLive(integrations.map((integration) => integration.id))
    return { ...query, integrations }
}
