"use client"

import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { appChannel } from "@/lib/pusher/channel-names"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import { AI_PROVIDERS, type AiProviderId, type AiProviderStatusDto } from "@/lib/ai/providers"
import type { IntegrationListItemDto } from "@/features/integrations/types"
import { useIntegrations } from "@/features/integrations/hooks/useIntegrations"
import { AI_FEATURE_UPDATED_EVENT } from "../constants"
import type { TaskSummarySettings, UnderstandTaskSettings, BudgetPreviewSettings, EstimateHoursSettings, TaskRefinementSettings } from "../schemas"
import type { AiAgentDto, AiModelDto, TaskSummarySettingsDto, UnderstandTaskSettingsDto, BudgetPreviewSettingsDto, EstimateHoursSettingsDto, TaskRefinementSettingsDto } from "../types"

/** Consultas e mutações dos provedores e features de IA. */

export const AI_QUERY_KEY = "ai"
const key = (...parts: unknown[]) => [AI_QUERY_KEY, ...parts] as const
const get = async <T,>(path: string) => unwrapApi((await api.get<ApiResponse<T>>(path)).data)

/** Situação dos provedores de texto, derivada da lista de integrações (status ao vivo). O JEV
 * (decisão estruturada, sem geração de texto) não é oferecido às features de texto. */
export function toProviderStatuses(integrations: readonly IntegrationListItemDto[]): AiProviderStatusDto[] {
    return AI_PROVIDERS.filter((provider) => provider.supportsTextGeneration).map((provider) => {
        const item = integrations.find((integration) => integration.id === provider.integrationId)
        const configured = item?.configured === true
        return {
            id: provider.id,
            integrationId: provider.integrationId,
            name: provider.name,
            configured,
            connected: configured && (item?.health.status === "ok" || item?.health.status === "warn"),
        }
    })
}

export function useAiProviderStatuses() {
    const query = useIntegrations()
    return { ...query, providers: toProviderStatuses(query.data ?? []) }
}

export const useAiModels = (provider: AiProviderId | null, enabled = true) =>
    useQuery({ queryKey: key("models", provider), queryFn: () => get<AiModelDto[]>(`/ai/providers/${provider}/models`), enabled: enabled && provider !== null, staleTime: 2 * 60_000, retry: false })

/** Recarrega a lista ignorando o cache do servidor. */
export function useRefreshAiModels(provider: AiProviderId) {
    const queryClient = useQueryClient()
    return () =>
        queryClient
            .fetchQuery({ queryKey: key("models", provider), queryFn: () => get<AiModelDto[]>(`/ai/providers/${provider}/models?refresh=1`) })
            .catch((error: unknown) => toast.error(apiErrorMessage(error, "Não foi possível atualizar os modelos")))
}

export const useAiAgents = (enabled: boolean) => useQuery({ queryKey: key("agents"), queryFn: () => get<AiAgentDto[]>("/ai/agents"), enabled, staleTime: 2 * 60_000, retry: false })

export const useUnderstandTaskSettings = () => useQuery({ queryKey: key("feature", "understand-task"), queryFn: () => get<UnderstandTaskSettingsDto>("/ai/features/understand-task") })

export function useSaveUnderstandTaskSettings() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: UnderstandTaskSettings) => unwrapApi((await api.put<ApiResponse<UnderstandTaskSettingsDto>>("/ai/features/understand-task", input)).data),
        onSuccess: (saved) => {
            queryClient.setQueryData(key("feature", "understand-task"), saved)
            toast.success("Configuração de \"Entender tarefas\" salva")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível salvar a configuração")),
    })
}

export const useTaskSummarySettings = () => useQuery({ queryKey: key("feature", "task-summary"), queryFn: () => get<TaskSummarySettingsDto>("/ai/features/task-summary") })

export function useSaveTaskSummarySettings() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: TaskSummarySettings) => unwrapApi((await api.put<ApiResponse<TaskSummarySettingsDto>>("/ai/features/task-summary", input)).data),
        onSuccess: (saved) => {
            queryClient.setQueryData(key("feature", "task-summary"), saved)
            toast.success("Configuração de \"Resumos de tarefas\" salva")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível salvar a configuração")),
    })
}

export const useBudgetPreviewSettings = () => useQuery({ queryKey: key("feature", "budget-preview"), queryFn: () => get<BudgetPreviewSettingsDto>("/ai/features/budget-preview") })

export function useSaveBudgetPreviewSettings() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: BudgetPreviewSettings) => unwrapApi((await api.put<ApiResponse<BudgetPreviewSettingsDto>>("/ai/features/budget-preview", input)).data),
        onSuccess: (saved) => {
            queryClient.setQueryData(key("feature", "budget-preview"), saved)
            toast.success("Configuração de \"Orçamentos\" salva")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível salvar a configuração")),
    })
}

export const useEstimateHoursSettings = () => useQuery({ queryKey: key("feature", "estimate-hours"), queryFn: () => get<EstimateHoursSettingsDto>("/ai/features/estimate-hours") })

export function useSaveEstimateHoursSettings() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: EstimateHoursSettings) => unwrapApi((await api.put<ApiResponse<EstimateHoursSettingsDto>>("/ai/features/estimate-hours", input)).data),
        onSuccess: (saved) => {
            queryClient.setQueryData(key("feature", "estimate-hours"), saved)
            toast.success("Configuração de \"Estimar prazos\" salva")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível salvar a configuração")),
    })
}

export const useTaskRefinementSettings = () => useQuery({ queryKey: key("feature", "task-refinement"), queryFn: () => get<TaskRefinementSettingsDto>("/ai/features/task-refinement") })

export function useSaveTaskRefinementSettings() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: TaskRefinementSettings) => unwrapApi((await api.put<ApiResponse<TaskRefinementSettingsDto>>("/ai/features/task-refinement", input)).data),
        onSuccess: (saved) => {
            queryClient.setQueryData(key("feature", "task-refinement"), saved)
            toast.success("Configuração de \"Refinar tarefa\" salva")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível salvar a configuração")),
    })
}

/** Configuração de feature alterada (em outra aba/janela): recarrega. */
export function useAiFeatureRealtime(): void {
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!isPusherClientAvailable()) return
        const name = appChannel()
        const channel = acquireChannel(name)
        const handler = () => void queryClient.invalidateQueries({ queryKey: key("feature") })
        channel.bind(AI_FEATURE_UPDATED_EVENT, handler)
        return () => {
            channel.unbind(AI_FEATURE_UPDATED_EVENT, handler)
            releaseChannel(name)
        }
    }, [queryClient])
}
