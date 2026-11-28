"use client"

import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage } from "@/lib/api"
import { acquireChannel, releaseChannel } from "@/lib/pusher/client"
import { appChannel } from "@/lib/pusher/channel-names"
import { integrationDetailKey, integrationsListKey } from "@nandobfer/integracoes/react"
import { EVOLUTION_INTEGRATION_ID, EVOLUTION_QUERY_KEY, EVOLUTION_UPDATED_EVENT } from "../constants"
import type { EvolutionContactDto } from "../types"

export const PREFILL = "/integrations/evolution-api/prefill"

export function useEvolution<T>(path: string, enabled = true, poll?: number) {
    return useQuery({ queryKey: [EVOLUTION_QUERY_KEY, path], enabled, refetchInterval: poll,
        queryFn: async () => (await api.get<{ data: T }>(path)).data.data })
}

/** Conversas com nome (rótulos dos canais do Secretário no universo). Sem a integração configurada, fica vazio. */
export function useSecretaryChannelContacts(enabled: boolean) {
    return useQuery({
        queryKey: [EVOLUTION_QUERY_KEY, "/evolution/contacts?kind=chats", "labels"],
        enabled,
        retry: false,
        staleTime: 5 * 60_000,
        queryFn: async () => (await api.get<{ data: EvolutionContactDto[] }>("/evolution/contacts?kind=chats")).data.data,
    })
}

export function useEvolutionAction<T = unknown, Input = unknown>(path: string, method: "post" | "put" | "delete", success: string) {
    const cache = useQueryClient()
    return useMutation({
        mutationFn: async (payload: Input) => (await api.request<{ data: T }>({ url: path, method, data: payload })).data.data,
        onSuccess: () => {
            toast.success(success)
            void cache.invalidateQueries({ queryKey: [EVOLUTION_QUERY_KEY] })
            void cache.invalidateQueries({ queryKey: integrationDetailKey(EVOLUTION_INTEGRATION_ID) })
            void cache.invalidateQueries({ queryKey: integrationsListKey })
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível concluir a operação")),
    })
}

export function useEvolutionRealtime() {
    const cache = useQueryClient()
    useEffect(() => {
        const name = appChannel()
        const channel = acquireChannel(name)
        if (!channel) return
        const refresh = () => void cache.invalidateQueries({ queryKey: [EVOLUTION_QUERY_KEY] })
        channel.bind(EVOLUTION_UPDATED_EVENT, refresh)
        channel.bind("pusher:subscription_succeeded", refresh)
        return () => {
            channel.unbind(EVOLUTION_UPDATED_EVENT, refresh)
            channel.unbind("pusher:subscription_succeeded", refresh)
            releaseChannel(name)
        }
    }, [cache])
}
