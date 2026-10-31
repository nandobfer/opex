"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import type { ClientMaddoxAgentConfigInput } from "../schemas"
import type { MaddoxClientAgentConfigDto } from "../types"

/** Configuração do Agente Maddox de um cliente (aba do dono em Integrações › Clientes). */

export const clientMaddoxConfigKey = (clientId: string) => ["maddox-client-config", clientId] as const

export const useClientMaddoxAgentConfig = (clientId: string) =>
    useQuery({
        queryKey: clientMaddoxConfigKey(clientId),
        queryFn: async () => unwrapApi((await api.get<ApiResponse<MaddoxClientAgentConfigDto>>(`/integrations/orcamentos/clients/${clientId}/maddox-agent`)).data),
        staleTime: 30_000,
    })

export function useSaveClientMaddoxAgentConfig(clientId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: ClientMaddoxAgentConfigInput) =>
            unwrapApi((await api.put<ApiResponse<MaddoxClientAgentConfigDto>>(`/integrations/orcamentos/clients/${clientId}/maddox-agent`, input)).data),
        onSuccess: (saved) => {
            queryClient.setQueryData(clientMaddoxConfigKey(clientId), saved)
            toast.success("Configuração do Agente Maddox salva")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível salvar a configuração")),
    })
}
