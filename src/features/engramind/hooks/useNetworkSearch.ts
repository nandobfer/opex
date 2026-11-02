"use client"

import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { ENGRAMIND_QUERY_KEY } from "../constants"
import { relevantSearchIds, type SearchFusion } from "../network/network-math"
import type { SearchResults } from "../types"
import { engramindSend } from "./useEngramind"

/** Limite de canais citados por requisição (schema de `search_memories`). */
export const SEARCH_CHANNELS_PER_REQUEST = 50
const SEARCH_LIMIT = 50

export interface NetworkSearchResult {
    ids: Set<string>
    textOnly: boolean
}

/** Divide os canais citados em lotes de `size`. Sem canais: um lote vazio (busca sem citar canais). */
export function channelBatches(channels: readonly string[], size = SEARCH_CHANNELS_PER_REQUEST): string[][] {
    const unique = [...new Set(channels)].sort()
    if (!unique.length) return [[]]
    const batches: string[][] = []
    for (let index = 0; index < unique.length; index += size) batches.push(unique.slice(index, index + size))
    return batches
}

/**
 * Busca da rede (OPE-113): roda sozinha com o termo (a espera de digitação fica no campo), cita os
 * canais da visão atual (o Engramind só busca nos canais `manage` e arquivados quando citados), em lotes
 * de 50, e destaca só os resultados relevantes (`relevantSearchIds`).
 */
export function useNetworkSearch({ query, channels, categories, fusion, enabled = true }: { query: string; channels: readonly string[]; categories: readonly string[]; fusion: SearchFusion; enabled?: boolean }) {
    const text = query.trim()
    const batches = channelBatches(channels)
    const sortedCategories = [...new Set(categories)].sort()
    return useQuery({
        // Fora da área `memories`: memória alterada pelo tempo real não refaz a busca. Cada busca conta como
        // consulta no Engramind (`retrieval_count`, `last_retrieved_at`), então ela só roda quando o termo,
        // os canais citados ou as categorias mudam: sem refazer por foco, reconexão ou idade do cache.
        queryKey: [ENGRAMIND_QUERY_KEY, "network-search", text, batches, sortedCategories, fusion.vectorWeight, fusion.textWeight, fusion.k],
        enabled: enabled && text.length > 0,
        placeholderData: keepPreviousData,
        staleTime: Number.POSITIVE_INFINITY,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false,
        retry: false,
        queryFn: async (): Promise<NetworkSearchResult> => {
            const responses = await Promise.all(
                batches.map((batch) =>
                    engramindSend<SearchResults>("post", "memories/search", {
                        query: text,
                        ...(batch.length ? { channels: batch } : {}),
                        ...(sortedCategories.length ? { categories: sortedCategories } : {}),
                        include_archived: true,
                        limit: SEARCH_LIMIT,
                    }),
                ),
            )
            const ids = new Set<string>()
            for (const response of responses) for (const id of relevantSearchIds(response.results, response.mode, fusion)) ids.add(id)
            return { ids, textOnly: responses.some((response) => response.mode === "text") }
        },
    })
}
