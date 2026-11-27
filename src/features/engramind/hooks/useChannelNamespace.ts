"use client"

import { useEffect } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { appChannel } from "@/lib/pusher/channel-names"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import type { ChannelNamespace } from "../channel-namespace"
import { ENGRAMIND_UPDATED_EVENT, NAMESPACE_EVENT_TYPE } from "../constants"
import { areaKey, engramindGet, engramindKey } from "./useEngramind"

export const NAMESPACE_ROUTE = "namespace"

/**
 * Espaço de nomes dos canais desta instância (OPE-206): o app e se os canais levam o app na frente. As telas que
 * montam canal (universos, rótulos, rotineiros) esperam por ele. Muda só com a migração B ou a troca da chave
 * (`engramind-updated` com `namespace`).
 */
export function useChannelNamespace(options: { enabled?: boolean } = {}) {
    const queryClient = useQueryClient()
    const enabled = options.enabled !== false
    useEffect(() => {
        if (!enabled || !isPusherClientAvailable()) return
        const name = appChannel()
        const channel = acquireChannel(name)
        const handler = (payload: { type?: string }) => {
            if (payload?.type === NAMESPACE_EVENT_TYPE) void queryClient.invalidateQueries({ queryKey: areaKey(NAMESPACE_ROUTE) })
        }
        channel.bind(ENGRAMIND_UPDATED_EVENT, handler)
        return () => {
            channel.unbind(ENGRAMIND_UPDATED_EVENT, handler)
            releaseChannel(name)
        }
    }, [enabled, queryClient])
    return useQuery({
        queryKey: engramindKey(NAMESPACE_ROUTE),
        queryFn: () => engramindGet<ChannelNamespace>(NAMESPACE_ROUTE),
        enabled,
        staleTime: 10 * 60_000,
        retry: 1,
    })
}
