"use client"

import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import { appChannel } from "@/lib/pusher/channel-names"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import type { ApiResponse } from "@/lib/types/api"
import { INTEGRATIONS_QUERY_KEY } from "@/features/integrations/hooks/useIntegrations"
import { AI_PROVIDER_KEYS_UPDATED_EVENT, type AiApiKeyDto, type AiApiKeyProviderId, type CreateAiApiKeyInput, type UpdateAiApiKeyInput } from "../api-keys"
import { AI_QUERY_KEY } from "./useAi"

/** Chaves de API nomeadas de um provedor de IA (OPE-155). O segredo nunca volta do servidor. */

export const aiApiKeysKey = (provider: AiApiKeyProviderId) => [AI_QUERY_KEY, "api-keys", provider] as const
const base = (provider: AiApiKeyProviderId) => `/ai/providers/${provider}/keys`

/** A chave efetiva mudou: status, modelos, consumo e o detalhe da integração são relidos. */
function invalidateDependents(queryClient: QueryClient): void {
    void queryClient.invalidateQueries({ queryKey: [AI_QUERY_KEY] })
    void queryClient.invalidateQueries({ queryKey: [INTEGRATIONS_QUERY_KEY] })
}

/** `provider` nulo = sem chaveiro (ex.: painel do OpenCode): a consulta fica desligada. */
export function useAiApiKeys(provider: AiApiKeyProviderId | null) {
    return useQuery({
        queryKey: [AI_QUERY_KEY, "api-keys", provider],
        enabled: provider !== null,
        queryFn: async () => unwrapApi((await api.get<ApiResponse<AiApiKeyDto[]>>(base(provider!))).data),
    })
}

function useKeysMutation<V>(provider: AiApiKeyProviderId, request: (vars: V) => Promise<AiApiKeyDto[]>, messages: { success: string; error: string }) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: request,
        onSuccess: (keys) => {
            queryClient.setQueryData(aiApiKeysKey(provider), keys)
            invalidateDependents(queryClient)
            toast.success(messages.success)
        },
        onError: (error) => toast.error(apiErrorMessage(error, messages.error)),
    })
}

export function useCreateAiApiKey(provider: AiApiKeyProviderId) {
    return useKeysMutation(
        provider,
        async (input: CreateAiApiKeyInput) => unwrapApi((await api.post<ApiResponse<AiApiKeyDto[]>>(base(provider), input)).data),
        { success: "Chave de API adicionada", error: "Não foi possível adicionar a chave" },
    )
}

export function useUpdateAiApiKey(provider: AiApiKeyProviderId, success = "Chave de API atualizada") {
    return useKeysMutation(
        provider,
        async ({ id, input }: { id: string; input: UpdateAiApiKeyInput }) => unwrapApi((await api.patch<ApiResponse<AiApiKeyDto[]>>(`${base(provider)}/${id}`, input)).data),
        { success, error: "Não foi possível salvar a chave" },
    )
}

export function useRemoveAiApiKey(provider: AiApiKeyProviderId) {
    return useKeysMutation(
        provider,
        async (id: string) => unwrapApi((await api.delete<ApiResponse<AiApiKeyDto[]>>(`${base(provider)}/${id}`)).data),
        { success: "Chave de API removida", error: "Não foi possível remover a chave" },
    )
}

/** Ativar: resposta otimista (o selo "Em uso" muda na hora), com reversão e toast na falha. */
export function useActivateAiApiKey(provider: AiApiKeyProviderId) {
    const queryClient = useQueryClient()
    const key = aiApiKeysKey(provider)
    return useMutation({
        mutationFn: async (id: string) => unwrapApi((await api.post<ApiResponse<AiApiKeyDto[]>>(`${base(provider)}/${id}/activate`)).data),
        onMutate: async (id) => {
            await queryClient.cancelQueries({ queryKey: key })
            const previous = queryClient.getQueryData<AiApiKeyDto[]>(key)
            queryClient.setQueryData<AiApiKeyDto[]>(key, (rows) => rows?.map((row) => ({ ...row, active: row.id === id })))
            return { previous }
        },
        onError: (error, _id, context) => {
            if (context?.previous) queryClient.setQueryData(key, context.previous)
            toast.error(apiErrorMessage(error, "Não foi possível ativar a chave"))
        },
        onSuccess: (keys) => {
            queryClient.setQueryData(key, keys)
            invalidateDependents(queryClient)
            toast.success("Chave em uso atualizada")
        },
    })
}

/** Chaveiro ao vivo: mudanças em outra aba (ou por outro caminho) relêem a lista e o que depende dela. */
export function useAiApiKeysRealtime(provider: AiApiKeyProviderId): void {
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!isPusherClientAvailable()) return
        const name = appChannel()
        const channel = acquireChannel(name)
        const handler = (payload?: { provider?: string }) => {
            if (payload?.provider && payload.provider !== provider) return
            void queryClient.invalidateQueries({ queryKey: aiApiKeysKey(provider) })
            invalidateDependents(queryClient)
        }
        channel.bind(AI_PROVIDER_KEYS_UPDATED_EVENT, handler)
        channel.bind("pusher:subscription_succeeded", handler)
        return () => {
            channel.unbind(AI_PROVIDER_KEYS_UPDATED_EVENT, handler)
            channel.unbind("pusher:subscription_succeeded", handler)
            releaseChannel(name)
        }
    }, [queryClient, provider])
}
