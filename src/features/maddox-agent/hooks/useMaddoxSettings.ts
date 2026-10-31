"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import { BASE_PATH } from "@/lib/base-path"
import type { ApiResponse } from "@/lib/types/api"
import { AI_QUERY_KEY } from "@/features/ai/hooks/useAi"
import { MADDOX_FEATURE } from "../constants"
import type { MaddoxAgentSettings } from "../schemas"
import type { MaddoxAgentSettingsDto, MaddoxMcpStatusDto } from "../types"

/** Mesma chave das features de IA: o `useAiFeatureRealtime` da página recarrega ao mudar. */
export const MADDOX_SETTINGS_KEY = [AI_QUERY_KEY, "feature", MADDOX_FEATURE] as const
export const MADDOX_MCP_STATUS_KEY = [AI_QUERY_KEY, "feature", MADDOX_FEATURE, "mcp"] as const

export const useMaddoxSettings = (enabled = true) =>
    useQuery({
        queryKey: MADDOX_SETTINGS_KEY,
        queryFn: async () => unwrapApi((await api.get<ApiResponse<MaddoxAgentSettingsDto>>(`/ai/features/${MADDOX_FEATURE}`)).data),
        enabled,
    })

/** Situação dos MCPs do Opex no OpenCode (aba de configuração). */
export const useMaddoxMcpStatus = (enabled = true) =>
    useQuery({
        queryKey: MADDOX_MCP_STATUS_KEY,
        queryFn: async () => unwrapApi((await api.get<ApiResponse<MaddoxMcpStatusDto>>(`/ai/features/${MADDOX_FEATURE}/mcp`)).data),
        enabled,
        staleTime: 15_000,
    })

export function useReconnectMaddoxMcp() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async () => unwrapApi((await api.get<ApiResponse<MaddoxMcpStatusDto>>(`/ai/features/${MADDOX_FEATURE}/mcp`, { params: { reconnect: 1 } })).data),
        onSuccess: (status) => {
            queryClient.setQueryData(MADDOX_MCP_STATUS_KEY, status)
            if (status.error) toast.error(status.error)
            else toast.success("MCP do Opex registrado de novo no OpenCode")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível falar com o OpenCode")),
    })
}

/** Origem que o OpenCode usa para chamar o MCP do Opex: o endereço aberto no navegador (com o `basePath`). */
export function browserMcpBaseUrl(): string | null {
    if (typeof window === "undefined") return null
    return `${window.location.origin}${BASE_PATH}`.replace(/\/+$/, "")
}

export function useSaveMaddoxSettings() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: MaddoxAgentSettings) => unwrapApi((await api.put<ApiResponse<MaddoxAgentSettingsDto>>(`/ai/features/${MADDOX_FEATURE}`, { ...input, mcpBaseUrl: browserMcpBaseUrl() ?? input.mcpBaseUrl })).data),
        onSuccess: (saved) => {
            queryClient.setQueryData(MADDOX_SETTINGS_KEY, saved)
            void queryClient.invalidateQueries({ queryKey: MADDOX_MCP_STATUS_KEY })
            toast.success('Configuração do "Agente Maddox" salva')
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível salvar a configuração")),
    })
}
