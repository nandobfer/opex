"use client"

import { useEffect, useMemo } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import type { RelatedMap } from "@engramind/client/react"
import { appChannel } from "@/lib/pusher/channel-names"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import { ENGRAMIND_UPDATED_EVENT, RELATED_MEMORIES_EVENT_TYPE } from "../constants"
import { areaKey, engramindGet, engramindKey } from "./useEngramind"
import type { RelatedMemoriesDto } from "../types"

export const RELATED_MEMORIES_ROUTE = "related-memories"

/** O evento muda as similares guardadas? (o cache recalculou ou uma memória mudou). */
export const isRelatedMemoriesEvent = (type: string | undefined): boolean => type === RELATED_MEMORIES_EVENT_TYPE || Boolean(type?.startsWith("memory."))

/** Mapa id → similares, para a prop `relatedMemories` da lib. */
export function toRelatedMap(dto: RelatedMemoriesDto | undefined): RelatedMap | undefined {
    if (!dto) return undefined
    return new Map(Object.entries(dto.related))
}

/**
 * Similares das memórias (OPE-164) para a visualização "Relacionadas": só consulta quando o layout vigente usa
 * `links = related` (o primeiro cálculo no servidor só começa aí). As arestas entram aos poucos: cada lote
 * calculado chega pelo `engramind-updated` `related-memories`, sem recarregar a página.
 */
export function useRelatedMemories(options: { enabled: boolean }) {
    const queryClient = useQueryClient()
    const enabled = options.enabled
    useEffect(() => {
        if (!enabled || !isPusherClientAvailable()) return
        const name = appChannel()
        const channel = acquireChannel(name)
        const handler = (payload: { type?: string }) => {
            if (isRelatedMemoriesEvent(payload?.type)) void queryClient.invalidateQueries({ queryKey: areaKey(RELATED_MEMORIES_ROUTE) })
        }
        channel.bind(ENGRAMIND_UPDATED_EVENT, handler)
        return () => {
            channel.unbind(ENGRAMIND_UPDATED_EVENT, handler)
            releaseChannel(name)
        }
    }, [enabled, queryClient])
    const query = useQuery({
        queryKey: engramindKey(RELATED_MEMORIES_ROUTE),
        queryFn: () => engramindGet<RelatedMemoriesDto>(RELATED_MEMORIES_ROUTE),
        enabled,
        staleTime: 5 * 60_000,
        retry: 1,
    })
    const map = useMemo(() => toRelatedMap(query.data), [query.data])
    return { ...query, map }
}
