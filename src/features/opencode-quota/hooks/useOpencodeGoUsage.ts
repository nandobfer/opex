"use client"

import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { appChannel } from "@/lib/pusher/channel-names"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import type { UsageQuery } from "@/features/ai/provider-usage"
import { OPENCODE_GO_USAGE_QUERY_KEY, OPENCODE_GO_USAGE_UPDATED_EVENT } from "../go-constants"
import type { OpencodeGoUsageDto } from "../go-types"

/** Consumo da assinatura OpenCode Go para o período e a chave do filtro; atualizado pelo evento da rotina. */
export function useOpencodeGoUsage(query: UsageQuery | null) {
    return useQuery({
        queryKey: [OPENCODE_GO_USAGE_QUERY_KEY, query],
        queryFn: async () => unwrapApi((await api.get<ApiResponse<OpencodeGoUsageDto>>("/opencode/quota/go", { params: query })).data),
        enabled: query !== null,
        staleTime: 60_000,
        retry: false,
    })
}

export function useRefreshOpencodeGoUsage(query: UsageQuery | null) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async () => unwrapApi((await api.post<ApiResponse<OpencodeGoUsageDto>>("/opencode/quota/go/refresh", null, { params: query })).data),
        onSuccess: (dto) => queryClient.setQueryData([OPENCODE_GO_USAGE_QUERY_KEY, query], dto),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível atualizar o consumo da assinatura OpenCode Go")),
    })
}

export function useOpencodeGoUsageRealtime(): void {
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!isPusherClientAvailable()) return
        const name = appChannel()
        const channel = acquireChannel(name)
        const handler = () => void queryClient.invalidateQueries({ queryKey: [OPENCODE_GO_USAGE_QUERY_KEY] }, { cancelRefetch: false })
        channel.bind(OPENCODE_GO_USAGE_UPDATED_EVENT, handler)
        return () => {
            channel.unbind(OPENCODE_GO_USAGE_UPDATED_EVENT, handler)
            releaseChannel(name)
        }
    }, [queryClient])
}
