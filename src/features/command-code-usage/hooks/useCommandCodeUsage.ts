"use client"

import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { appChannel } from "@/lib/pusher/channel-names"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import type { UsageQuery } from "@/features/ai/provider-usage"
import { COMMAND_CODE_USAGE_QUERY_KEY, COMMAND_CODE_USAGE_UPDATED_EVENT } from "../constants"
import type { CommandCodeUsageDto } from "../types"

/** Consumo da assinatura Command Code para o período e a chave do filtro; atualizado pelo evento da rotina. */
export function useCommandCodeUsage(query: UsageQuery | null) {
    return useQuery({
        queryKey: [COMMAND_CODE_USAGE_QUERY_KEY, query],
        queryFn: async () => unwrapApi((await api.get<ApiResponse<CommandCodeUsageDto>>("/command-code/usage", { params: query })).data),
        enabled: query !== null,
        staleTime: 60_000,
        retry: false,
    })
}

export function useRefreshCommandCodeUsage(query: UsageQuery | null) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async () => unwrapApi((await api.post<ApiResponse<CommandCodeUsageDto>>("/command-code/usage/refresh", null, { params: query })).data),
        onSuccess: (dto) => queryClient.setQueryData([COMMAND_CODE_USAGE_QUERY_KEY, query], dto),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível atualizar o consumo da assinatura Command Code")),
    })
}

export function useCommandCodeUsageRealtime(): void {
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!isPusherClientAvailable()) return
        const name = appChannel()
        const channel = acquireChannel(name)
        const handler = () => void queryClient.invalidateQueries({ queryKey: [COMMAND_CODE_USAGE_QUERY_KEY] }, { cancelRefetch: false })
        channel.bind(COMMAND_CODE_USAGE_UPDATED_EVENT, handler)
        return () => {
            channel.unbind(COMMAND_CODE_USAGE_UPDATED_EVENT, handler)
            releaseChannel(name)
        }
    }, [queryClient])
}
