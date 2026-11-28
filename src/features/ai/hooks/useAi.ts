"use client"

import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { appChannel } from "@/lib/pusher/channel-names"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import { AI_QUERY_KEY } from "@nandobfer/integracoes/modules/integrations/ia/features/ai/hooks/useAi"
import { AI_FEATURE_UPDATED_EVENT } from "../constants"
import type { TaskSummarySettings, TaskTagsSettings, BudgetPreviewSettings, EstimateHoursSettings, TaskRefinementSettings, PluginVersionSummarySettings } from "../schemas"
import type { TaskSummarySettingsDto, TaskTagsSettingsDto, BudgetPreviewSettingsDto, EstimateHoursSettingsDto, TaskRefinementSettingsDto, PluginVersionSummarySettingsDto } from "../types"

/** Consultas e mutações das features de IA do Opex (os provedores, modelos e agentes vêm da central `@nandobfer/integracoes`). */

const key = (...parts: unknown[]) => [AI_QUERY_KEY, ...parts] as const
const get = async <T,>(path: string) => unwrapApi((await api.get<ApiResponse<T>>(path)).data)

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

export const usePluginVersionSummarySettings = () => useQuery({ queryKey: key("feature", "plugin-version-summary"), queryFn: () => get<PluginVersionSummarySettingsDto>("/ai/features/plugin-version-summary") })

export function useSavePluginVersionSummarySettings() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: PluginVersionSummarySettings) => unwrapApi((await api.put<ApiResponse<PluginVersionSummarySettingsDto>>("/ai/features/plugin-version-summary", input)).data),
        onSuccess: (saved) => {
            queryClient.setQueryData(key("feature", "plugin-version-summary"), saved)
            toast.success('Configuração de "Descritivo de versão de plugin" salva')
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível salvar a configuração")),
    })
}

export const useTaskTagsSettings = () => useQuery({ queryKey: key("feature", "task-tags"), queryFn: () => get<TaskTagsSettingsDto>("/ai/features/task-tags") })

export function useSaveTaskTagsSettings() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: TaskTagsSettings) => unwrapApi((await api.put<ApiResponse<TaskTagsSettingsDto>>("/ai/features/task-tags", input)).data),
        onSuccess: (saved) => {
            queryClient.setQueryData(key("feature", "task-tags"), saved)
            toast.success("Configuração de \"Tags de tarefas\" salva")
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
            toast.success("Configuração do \"Agente Refinador\" salva")
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
