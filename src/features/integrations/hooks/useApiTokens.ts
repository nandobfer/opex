"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import type { ApiTokenInput } from "../api-tokens/schemas"
import type { ApiTokenDto, CreatedApiTokenDto } from "../api-tokens/types"

/** Tokens de sistema da API interna (Integrações › API interna). */

const BASE = "/integrations/internal_api/tokens"
export const apiTokensKey = ["integrations", "internal_api", "tokens"] as const

export function useApiTokens() {
    return useQuery({ queryKey: apiTokensKey, queryFn: async () => unwrapApi((await api.get<ApiResponse<ApiTokenDto[]>>(BASE)).data) })
}

export function useCreateApiToken() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: ApiTokenInput) => unwrapApi((await api.post<ApiResponse<CreatedApiTokenDto>>(BASE, input)).data),
        onSuccess: () => void queryClient.invalidateQueries({ queryKey: apiTokensKey }),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível gerar o token")),
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
