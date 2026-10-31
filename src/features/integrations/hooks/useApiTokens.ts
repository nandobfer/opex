"use client"

import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import { appChannel } from "@/lib/pusher/channel-names"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import type { ApiResponse } from "@/lib/types/api"
import { API_TOKENS_UPDATED_EVENT } from "../api-tokens/events"
import type { ApiTokenInput, ApiTokenUpdateInput } from "../api-tokens/schemas"
import type { ApiTokenDto, ApiTokenScopeCatalogDto, CreatedApiTokenDto } from "../api-tokens/types"

/** Tokens de sistema da API interna (Integrações › API interna). */

const BASE = "/integrations/internal_api/tokens"
export const apiTokensKey = ["integrations", "internal_api", "tokens"] as const
export const apiTokenScopesKey = ["integrations", "internal_api", "scopes"] as const

export function useApiTokens() {
    return useQuery({ queryKey: apiTokensKey, queryFn: async () => unwrapApi((await api.get<ApiResponse<ApiTokenDto[]>>(BASE)).data) })
}

/** Catálogo de escopos (rotas e ferramentas do MCP do dono) para o formulário. */
export function useApiTokenScopes(enabled = true) {
    return useQuery({
        queryKey: apiTokenScopesKey,
        enabled,
        staleTime: 60_000,
        queryFn: async () => unwrapApi((await api.get<ApiResponse<ApiTokenScopeCatalogDto>>("/integrations/internal_api/scopes")).data),
    })
}

export function useCreateApiToken() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: ApiTokenInput) => unwrapApi((await api.post<ApiResponse<CreatedApiTokenDto>>(BASE, input)).data),
        onSuccess: () => void queryClient.invalidateQueries({ queryKey: apiTokensKey }),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível gerar o token")),
    })
}

/** Editar escopos: resposta otimista na lista, com reversão e toast na falha. */
export function useUpdateApiToken() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async ({ id, input }: { id: string; input: ApiTokenUpdateInput }) => unwrapApi((await api.patch<ApiResponse<ApiTokenDto>>(`${BASE}/${id}`, input)).data),
        onMutate: async ({ id, input }) => {
            await queryClient.cancelQueries({ queryKey: apiTokensKey })
            const previous = queryClient.getQueryData<ApiTokenDto[]>(apiTokensKey)
            queryClient.setQueryData<ApiTokenDto[]>(apiTokensKey, (rows) =>
                rows?.map((row) => (row.id === id ? { ...row, escopos: [...input.escopos], legado: false, expiraEm: input.expiraEm ?? null, expirado: false } : row)),
            )
            return { previous }
        },
        onError: (error, _vars, context) => {
            if (context?.previous) queryClient.setQueryData(apiTokensKey, context.previous)
            toast.error(apiErrorMessage(error, "Não foi possível salvar os escopos"))
        },
        onSuccess: () => toast.success("Escopos atualizados"),
        onSettled: () => void queryClient.invalidateQueries({ queryKey: apiTokensKey }),
    })
}

export function useRevokeApiToken() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (id: string) => unwrapApi((await api.delete<ApiResponse<{ revogado: boolean }>>(`${BASE}/${id}`)).data),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: apiTokensKey })
            toast.success("Token revogado")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível revogar o token")),
    })
}

/** Lista ao vivo: gerar, editar ou revogar em outra aba relê a lista. */
export function useApiTokensRealtime(): void {
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!isPusherClientAvailable()) return
        const name = appChannel()
        const channel = acquireChannel(name)
        const handler = () => void queryClient.invalidateQueries({ queryKey: apiTokensKey })
        channel.bind(API_TOKENS_UPDATED_EVENT, handler)
        return () => {
            channel.unbind(API_TOKENS_UPDATED_EVENT, handler)
            releaseChannel(name)
        }
    }, [queryClient])
}
