"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import type { ClientOpexAgentConfigInput } from "../schemas"
import type { OpexClientAgentConfigDto } from "../types"

/** Configuração do Agente Opex de um cliente (aba do dono em Integrações › Clientes). */

export const clientOpexConfigKey = (clientId: string) => ["opex-client-config", clientId] as const

export const useClientOpexAgentConfig = (clientId: string) =>
    useQuery({
        queryKey: clientOpexConfigKey(clientId),
        queryFn: async () => unwrapApi((await api.get<ApiResponse<OpexClientAgentConfigDto>>(`/integrations/orcamentos/clients/${clientId}/opex-agent`)).data),
        staleTime: 30_000,
    })

export function useSaveClientOpexAgentConfig(clientId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: ClientOpexAgentConfigInput) =>
            unwrapApi((await api.put<ApiResponse<OpexClientAgentConfigDto>>(`/integrations/orcamentos/clients/${clientId}/opex-agent`, input)).data),
        onSuccess: (saved) => {
            queryClient.setQueryData(clientOpexConfigKey(clientId), saved)
            toast.success("Configuração do Agente Opex salva")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível salvar a configuração")),
    })
}
