"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import { getAiProvider } from "@/lib/ai/providers"
import type { ApiResponse } from "@/lib/types/api"
import { AI_QUERY_KEY } from "@/features/ai/hooks/useAi"
import { OPEX_FEATURE } from "../constants"
import type { AiFeatureAvailability } from "@/features/ai/types"
import { useOpexScope } from "../components/OpexScopeProvider"
import type { OpexAgentSettings } from "../schemas"
import type { OpexAgentSettingsDto, OpexClientStatusDto } from "../types"
import type { OpexFilesSettings } from "../schemas"

/** Mesma chave das features de IA: o `useAiFeatureRealtime` da página recarrega ao mudar. */
export const OPEX_SETTINGS_KEY = [AI_QUERY_KEY, "feature", OPEX_FEATURE] as const

export const useOpexSettings = (enabled = true) =>
    useQuery({
        queryKey: OPEX_SETTINGS_KEY,
        queryFn: async () => unwrapApi((await api.get<ApiResponse<OpexAgentSettingsDto>>(`/ai/features/${OPEX_FEATURE}`)).data),
        enabled,
    })

/** Situação do agente no **portal** (configuração do cliente, disponibilidade e limites). */
export const useOpexStatus = (enabled = true) => {
    const { http, apiBase, queryPrefix } = useOpexScope()
    return useQuery({
        queryKey: [queryPrefix, "status"],
        queryFn: async () => unwrapApi((await http.get<ApiResponse<OpexClientStatusDto>>(`${apiBase}/status`)).data),
        enabled,
        staleTime: 30_000,
    })
}

/** O que o painel precisa saber do agente, no escopo atual (dono ou portal). */
export interface OpexView {
    availability: AiFeatureAvailability
    files: OpexFilesSettings
    modelLabel: string | null
}

export function useOpexView(): { data: OpexView | undefined; isLoading: boolean } {
    const { kind } = useOpexScope()
    const settings = useOpexSettings(kind === "owner")
    const status = useOpexStatus(kind === "client")
    if (kind === "owner") {
        const data = settings.data
        return {
            data: data
                ? {
                      availability: data.availability,
                      files: data.settings.files,
                      modelLabel: data.settings.main.provider && data.settings.main.model ? `${getAiProvider(data.settings.main.provider).name} · ${data.settings.main.model}` : null,
                  }
                : undefined,
            isLoading: settings.isLoading,
        }
    }
    const data = status.data
    return {
        data: data ? { availability: { available: data.available, reason: data.reason }, files: data.files, modelLabel: data.modelLabel } : undefined,
        isLoading: status.isLoading,
    }
}

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
