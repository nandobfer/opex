"use client"

import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { appChannel } from "@/lib/pusher/channel-names"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import { OPENCODE_QUOTA_QUERY_KEY, OPENCODE_QUOTA_UPDATED_EVENT } from "../constants"
import type { OpencodeQuotaDto } from "../types"

/** Quota do OpenCode: atualizada pelo evento em tempo real da rotina, não por polling. */
export const useOpencodeQuota = () =>
    useQuery({
        queryKey: [OPENCODE_QUOTA_QUERY_KEY],
        queryFn: async () => unwrapApi((await api.get<ApiResponse<OpencodeQuotaDto>>("/opencode/quota")).data),
        staleTime: 5 * 60_000,
        retry: false,
    })

export function useRefreshOpencodeQuota() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async () => unwrapApi((await api.post<ApiResponse<OpencodeQuotaDto>>("/opencode/quota/refresh")).data),
        onSuccess: (dto) => queryClient.setQueryData([OPENCODE_QUOTA_QUERY_KEY], dto),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível atualizar a quota do OpenCode")),
    })
}

export function useOpencodeQuotaRealtime(): void {
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!isPusherClientAvailable()) return
        const name = appChannel()
        const channel = acquireChannel(name)
        const handler = () => void queryClient.invalidateQueries({ queryKey: [OPENCODE_QUOTA_QUERY_KEY] })
        channel.bind(OPENCODE_QUOTA_UPDATED_EVENT, handler)
        return () => {
            channel.unbind(OPENCODE_QUOTA_UPDATED_EVENT, handler)
            releaseChannel(name)
        }
    }, [queryClient])
}
