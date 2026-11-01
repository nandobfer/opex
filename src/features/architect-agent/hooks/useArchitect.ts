"use client"

import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { appChannel } from "@/lib/pusher/channel-names"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import { AI_QUERY_KEY } from "@/features/ai/hooks/useAi"
import { ARCHITECT_FEATURE, ARCHITECT_UPDATED_EVENT } from "../constants"
import type { ArchitectGenerateInput, ArchitectSettings } from "../schemas"
import type { ArchitectDiagramDto, ArchitectSettingsDto } from "../types"

/** Consultas e mutações do Agente Arquiteto. */

/** Mesma chave das features de IA: o `useAiFeatureRealtime` da página recarrega ao mudar. */
const settingsKey = () => [AI_QUERY_KEY, "feature", ARCHITECT_FEATURE] as const
export const ARCHITECT_KEY = ["architect"] as const
export const workbenchDiagramsKey = (workbenchId: string) => ["architect", "workbench", workbenchId] as const
const historyKey = () => ["architect", "history"] as const

const get = async <T,>(path: string) => unwrapApi((await api.get<ApiResponse<T>>(path)).data)

export const useArchitectSettings = () => useQuery({ queryKey: settingsKey(), queryFn: () => get<ArchitectSettingsDto>(`/ai/features/${ARCHITECT_FEATURE}`) })

export function useSaveArchitectSettings() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: ArchitectSettings) => unwrapApi((await api.put<ApiResponse<ArchitectSettingsDto>>(`/ai/features/${ARCHITECT_FEATURE}`, input)).data),
        onSuccess: (saved) => {
            queryClient.setQueryData(settingsKey(), saved)
            toast.success('Configuração do "Agente Arquiteto" salva')
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível salvar a configuração")),
    })
}

/** Versões geradas (aba Histórico da configuração). */
export const useArchitectHistory = () => useQuery({ queryKey: historyKey(), queryFn: () => get<ArchitectDiagramDto[]>("/architect/diagrams") })

/** Versões do diagrama da mesa (aba "Arquitetura"), da mais antiga à mais recente. */
export const useWorkbenchDiagrams = (workbenchId: string, enabled = true) =>
    useQuery({ queryKey: workbenchDiagramsKey(workbenchId), queryFn: () => get<ArchitectDiagramDto[]>(`/architect/workbenches/${workbenchId}/diagrams`), enabled })

/** Diagrama mudou (nova versão, progresso, pronto, falha): relê a mesa afetada e o histórico. */
export function useArchitectRealtime(enabled = true): void {
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!enabled || !isPusherClientAvailable()) return
        const name = appChannel()
        const channel = acquireChannel(name)
        const handler = (payload: { workbenchId?: string } | undefined) => {
            void queryClient.invalidateQueries({ queryKey: historyKey() })
            if (payload?.workbenchId) void queryClient.invalidateQueries({ queryKey: workbenchDiagramsKey(payload.workbenchId) })
        }
        channel.bind(ARCHITECT_UPDATED_EVENT, handler)
        return () => {
            channel.unbind(ARCHITECT_UPDATED_EVENT, handler)
            releaseChannel(name)
        }
    }, [enabled, queryClient])
}

/** Versão provisória exibida na hora ("gerando") até a resposta do servidor. */
function placeholder(workbenchId: string, list: readonly ArchitectDiagramDto[], input: ArchitectGenerateInput): ArchitectDiagramDto {
    const last = list.at(-1)
    return {
        id: `pending-${Date.now()}`,
        workbenchId,
        centralId: last?.centralId ?? "",
        taskId: last?.taskId ?? "",
        taskCode: last?.taskCode ?? "",
        taskTitle: last?.taskTitle ?? "",
        version: (last?.version ?? 0) + 1,
        planVersion: last?.planVersion ?? 1,
        planSeq: (last?.planSeq ?? 0) + 1,
        depth: input.depth ?? last?.depth ?? 3,
        origin: input.feedback ? "adjust" : "manual",
        feedback: input.feedback ?? null,
        state: "running",
        phase: "starting",
        tools: 0,
        graph: null,
        draft: null,
        trimmed: { nodes: 0, edges: 0 },
        warnings: [],
        repaired: false,
        error: null,
        costUsd: 0,
        durationMs: null,
        createdAt: new Date().toISOString(),
        finishedAt: null,
    }
}

/** "Gerar arquitetura" e "Pedir ajustes" (resposta otimista: a aba entra em "gerando" na hora). */
export function useGenerateDiagram(workbenchId: string) {
    const queryClient = useQueryClient()
    const key = workbenchDiagramsKey(workbenchId)
    return useMutation({
        mutationFn: async (input: ArchitectGenerateInput) => unwrapApi((await api.post<ApiResponse<ArchitectDiagramDto>>(`/architect/workbenches/${workbenchId}/diagrams`, input)).data),
        onMutate: async (input) => {
            await queryClient.cancelQueries({ queryKey: key })
            const previous = queryClient.getQueryData<ArchitectDiagramDto[]>(key)
            queryClient.setQueryData<ArchitectDiagramDto[]>(key, (current = []) => [...current, placeholder(workbenchId, current, input)])
            return { previous }
        },
        onError: (error, _input, context) => {
            queryClient.setQueryData(key, context?.previous)
            toast.error(apiErrorMessage(error, "Não foi possível gerar a arquitetura"))
        },
        onSuccess: (saved, input) => {
            queryClient.setQueryData<ArchitectDiagramDto[]>(key, (current = []) => [...current.filter((item) => !item.id.startsWith("pending-") && item.id !== saved.id), saved])
            toast.success(input.feedback ? "Ajuste enviado ao Agente Arquiteto" : "O Agente Arquiteto começou a desenhar")
        },
        onSettled: () => void queryClient.invalidateQueries({ queryKey: key }),
    })
}

/** "Tentar novamente" de uma versão que falhou (resposta otimista: volta a "gerando"). */
export function useRetryDiagram(workbenchId: string) {
    const queryClient = useQueryClient()
    const key = workbenchDiagramsKey(workbenchId)
    return useMutation({
        mutationFn: async (id: string) => unwrapApi((await api.post<ApiResponse<ArchitectDiagramDto>>(`/architect/diagrams/${id}/retry`, {})).data),
        onMutate: async (id) => {
            await queryClient.cancelQueries({ queryKey: key })
            const previous = queryClient.getQueryData<ArchitectDiagramDto[]>(key)
            queryClient.setQueryData<ArchitectDiagramDto[]>(key, (current = []) => current.map((item) => (item.id === id ? { ...item, state: "running", phase: "starting", error: null, tools: 0 } : item)))
            return { previous }
        },
        onError: (error, _id, context) => {
            queryClient.setQueryData(key, context?.previous)
            toast.error(apiErrorMessage(error, "Não foi possível tentar novamente"))
        },
        onSettled: () => void queryClient.invalidateQueries({ queryKey: key }),
    })
}
