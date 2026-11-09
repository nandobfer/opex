"use client"

import { useMemo } from "react"
import { urlFilterCodecs, useUrlFilters } from "@/hooks/useUrlFilters"
import type { AiApiKeyProviderId } from "../api-keys"
import { resolveUsageKey, USAGE_KEY_ALL, usageKeyOptions } from "../usage-key-filter"
import { useAiApiKeys } from "./useAiApiKeys"

const DEFAULTS = { usageKey: USAGE_KEY_ALL }
const SCHEMA = { usageKey: urlFilterCodecs.string() }

/**
 * Filtro "Chave de API" dos painéis de consumo (OPE-155), na URL (`usageKey`, padrão Todas). Um id
 * que não existe mais no provedor volta para "Todas". Sem chaveiro (`null`), vale sempre "Todas".
 */
export function useUsageKeyFilter(provider: AiApiKeyProviderId | null) {
    const [state, setState] = useUrlFilters(DEFAULTS, SCHEMA)
    const keys = useAiApiKeys(provider)
    const value = provider === null ? USAGE_KEY_ALL : resolveUsageKey(state.usageKey, keys.data)
    const options = useMemo(() => usageKeyOptions(keys.data ?? []), [keys.data])
    return { value, options, setValue: (usageKey: string) => setState({ usageKey }), reset: () => setState(DEFAULTS) }
}
