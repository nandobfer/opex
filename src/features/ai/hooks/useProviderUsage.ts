"use client"

import { useEffect } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { appChannel } from "@/lib/pusher/channel-names"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import { AI_CONSUMPTION_UPDATED_EVENT } from "@/lib/ai/consumption-events"
import type { ProviderUsageSummary, UsageQuery } from "../provider-usage"
import { AI_QUERY_KEY } from "./useAi"

/** Consumo medido de um provedor (OpenCode ou provedor direto), com atualização por Pusher. */
export function useProviderUsage(provider: string, query: UsageQuery | null) {
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!isPusherClientAvailable()) return
        const name = appChannel()
        const channel = acquireChannel(name)
        // O payload identifica o provedor: só reconsulta quem realmente mudou.
        const refresh = (payload?: { provider?: string }) => {
            if (payload?.provider && payload.provider !== provider) return
            void queryClient.invalidateQueries({ queryKey: [AI_QUERY_KEY, "usage", provider] })
        }
        channel.bind(AI_CONSUMPTION_UPDATED_EVENT, refresh)
        // Cada nova assinatura (inclusive reconexão) repõe os eventos que podem ter sido perdidos.
        channel.bind("pusher:subscription_succeeded", refresh)
        return () => {
            channel.unbind(AI_CONSUMPTION_UPDATED_EVENT, refresh)
            channel.unbind("pusher:subscription_succeeded", refresh)
            releaseChannel(name)
        }
    }, [queryClient, provider])
    return useQuery({
        queryKey: [AI_QUERY_KEY, "usage", provider, query],
        queryFn: async () => unwrapApi((await api.get<ApiResponse<ProviderUsageSummary>>(`/ai/providers/${provider}/usage`, { params: query })).data),
        enabled: query !== null,
    })
}
