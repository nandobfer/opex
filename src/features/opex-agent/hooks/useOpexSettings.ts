"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { AI_QUERY_KEY } from "@/features/ai/hooks/useAi"
import { OPEX_FEATURE } from "../constants"
import type { OpexAgentSettings } from "../schemas"
import type { OpexAgentSettingsDto } from "../types"

/** Mesma chave das features de IA: o `useAiFeatureRealtime` da página recarrega ao mudar. */
export const OPEX_SETTINGS_KEY = [AI_QUERY_KEY, "feature", OPEX_FEATURE] as const

export const useOpexSettings = (enabled = true) =>
    useQuery({
        queryKey: OPEX_SETTINGS_KEY,
        queryFn: async () => unwrapApi((await api.get<ApiResponse<OpexAgentSettingsDto>>(`/ai/features/${OPEX_FEATURE}`)).data),
        enabled,
    })

export function useSaveOpexSettings() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: OpexAgentSettings) => unwrapApi((await api.put<ApiResponse<OpexAgentSettingsDto>>(`/ai/features/${OPEX_FEATURE}`, input)).data),
        onSuccess: (saved) => {
            queryClient.setQueryData(OPEX_SETTINGS_KEY, saved)
            toast.success('Configuração do "Agente Opex" salva')
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível salvar a configuração")),
    })
}
