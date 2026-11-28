"use client"

import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import { appChannel } from "@/lib/pusher/channel-names"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import type { ApiResponse } from "@/lib/types/api"
import type { ChannelMigrationStateDto } from "../channel-migration/types"
import { CHANNEL_MIGRATION_EVENT_TYPE, ENGRAMIND_UPDATED_EVENT, NAMESPACE_EVENT_TYPE } from "../constants"
import type { ChannelMigrationStartInput } from "../schemas/channel-migration"
import { areaKey } from "./useEngramind"
import { NAMESPACE_ROUTE } from "./useChannelNamespace"

const KEY = areaKey("channel-migration")

/** Migração dos nomes dos canais (OPE-206): estado ao vivo (`engramind-updated`) e releitura enquanto roda. */
export function useChannelMigration() {
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!isPusherClientAvailable()) return
        const name = appChannel()
        const channel = acquireChannel(name)
        const handler = (payload: { type?: string }) => {
            if (payload?.type === CHANNEL_MIGRATION_EVENT_TYPE) void queryClient.invalidateQueries({ queryKey: KEY })
            if (payload?.type === NAMESPACE_EVENT_TYPE) {
                void queryClient.invalidateQueries({ queryKey: KEY })
                void queryClient.invalidateQueries({ queryKey: areaKey(NAMESPACE_ROUTE) })
            }
        }
        channel.bind(ENGRAMIND_UPDATED_EVENT, handler)
        return () => {
            channel.unbind(ENGRAMIND_UPDATED_EVENT, handler)
            releaseChannel(name)
        }
    }, [queryClient])
    return useQuery({
        queryKey: KEY,
        queryFn: async () => unwrapApi((await api.get<ApiResponse<ChannelMigrationStateDto>>("/engramind/channel-migration")).data),
        refetchInterval: (query) => (query.state.data?.current?.status === "running" ? 5_000 : false),
    })
}

export function useStartChannelMigration() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: ChannelMigrationStartInput) => unwrapApi((await api.post<ApiResponse<ChannelMigrationStateDto>>("/engramind/channel-migration", input)).data),
        onSuccess: (data, input) => {
            queryClient.setQueryData(KEY, data)
            toast.success(input.direction === "forward" ? "Migração dos canais em execução: acompanhe o progresso aqui" : "Volta atrás em execução: acompanhe o progresso aqui")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível iniciar a migração dos canais")),
    })
}
