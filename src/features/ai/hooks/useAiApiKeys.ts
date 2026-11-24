"use client"

import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import { appChannel } from "@/lib/pusher/channel-names"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import type { ApiResponse } from "@/lib/types/api"
import { INTEGRATIONS_QUERY_KEY } from "@/features/integrations/hooks/useIntegrations"
import { AI_PROVIDER_KEYS_UPDATED_EVENT, type AiApiKeyDto, type AiApiKeyProviderId, type AiApiKeySelectionInput, type CreateAiApiKeyInput, type UpdateAiApiKeyInput } from "../api-keys"
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

/** Mutação otimista do chaveiro: a lista muda na hora (`optimistic`), com reversão e toast na falha. */
function useOptimisticKeysMutation<V>(provider: AiApiKeyProviderId, request: (vars: V) => Promise<AiApiKeyDto[]>, optimistic: (rows: AiApiKeyDto[], vars: V) => AiApiKeyDto[], messages: { success: (vars: V) => string; error: string }) {
    const queryClient = useQueryClient()
    const key = aiApiKeysKey(provider)
    return useMutation({
        mutationFn: request,
        onMutate: async (vars: V) => {
            await queryClient.cancelQueries({ queryKey: key })
            const previous = queryClient.getQueryData<AiApiKeyDto[]>(key)
            queryClient.setQueryData<AiApiKeyDto[]>(key, (rows) => (rows ? optimistic(rows, vars) : rows))
            return { previous }
        },
        onError: (error, _vars, context) => {
            if (context?.previous) queryClient.setQueryData(key, context.previous)
            toast.error(apiErrorMessage(error, messages.error))
        },
        onSuccess: (keys, vars) => {
            queryClient.setQueryData(key, keys)
            invalidateDependents(queryClient)
            toast.success(messages.success(vars))
        },
    })
}

/** Pôr ou tirar a chave do rodízio (OPE-179); sem principal, a chave posta em uso vira a principal. */
export function useToggleAiApiKey(provider: AiApiKeyProviderId) {
    return useOptimisticKeysMutation(
        provider,
        async ({ id, selected }: { id: string } & AiApiKeySelectionInput) => unwrapApi((await api.patch<ApiResponse<AiApiKeyDto[]>>(`${base(provider)}/${id}/selection`, { selected })).data),
        (rows, { id, selected }) => {
            const noPrimary = !rows.some((row) => row.primary)
            return rows.map((row) => (row.id === id ? { ...row, active: selected, primary: row.primary || (selected && noPrimary) } : row))
        },
        { success: ({ selected }) => (selected ? "Chave posta em uso" : "Chave tirada de uso"), error: "Não foi possível alterar a chave em uso" },
    )
}

/** Tornar principal: a chave também entra em uso. */
export function useMakePrimaryAiApiKey(provider: AiApiKeyProviderId) {
    return useOptimisticKeysMutation(
        provider,
        async (id: string) => unwrapApi((await api.post<ApiResponse<AiApiKeyDto[]>>(`${base(provider)}/${id}/primary`)).data),
        (rows, id) => rows.map((row) => ({ ...row, primary: row.id === id, active: row.active || row.id === id })),
        { success: () => "Chave principal atualizada", error: "Não foi possível tornar a chave principal" },
    )
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
