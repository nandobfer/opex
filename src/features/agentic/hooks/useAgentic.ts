"use client"

import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { appChannel } from "@/lib/pusher/channel-names"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import { AGENTIC_UPDATED_EVENT } from "../constants"
import type { WorkbenchAction } from "../logic"
import type { AgenticSettings, CentralConfig, CreateCentralInput, FormReplyInput, PermissionReplyInput } from "../schemas"
import type { AgenticSettingsDto, CentralDto, CentralTestOutcome, WorkbenchDto, WorkbenchSummaryDto } from "../types"

/** Consultas e mutações do desenvolvimento agêntico. */

export const AGENTIC_QUERY_KEY = "agentic"
export const agenticKey = (...parts: unknown[]) => [AGENTIC_QUERY_KEY, ...parts] as const
const get = async <T,>(path: string) => unwrapApi((await api.get<ApiResponse<T>>(path)).data)

export const useAgenticSettings = () => useQuery({ queryKey: agenticKey("settings"), queryFn: () => get<AgenticSettingsDto>("/agentic/settings") })

export function useSaveAgenticSettings() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: AgenticSettings) => unwrapApi((await api.put<ApiResponse<AgenticSettingsDto>>("/agentic/settings", input)).data),
        onSuccess: (saved) => {
            queryClient.setQueryData(agenticKey("settings"), saved)
            toast.success("Configuração do desenvolvimento agêntico salva")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível salvar a configuração")),
    })
}

export const useCentrals = (enabled = true) => useQuery({ queryKey: agenticKey("centrals"), queryFn: () => get<CentralDto[]>("/agentic/centrals"), enabled })

export const useCentral = (id: string) => useQuery({ queryKey: agenticKey("central", id), queryFn: () => get<CentralDto>(`/agentic/centrals/${id}`) })

export function useCreateCentral() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: CreateCentralInput) => unwrapApi((await api.post<ApiResponse<CentralDto>>("/agentic/centrals", input)).data),
        onSuccess: (central) => {
            void queryClient.invalidateQueries({ queryKey: agenticKey("centrals") })
            toast.success(`Central de ${central.productName} criada`)
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível criar a central")),
    })
}

export function useUpdateCentral(id: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (config: CentralConfig) => unwrapApi((await api.put<ApiResponse<CentralDto>>(`/agentic/centrals/${id}`, config)).data),
        onSuccess: (central) => {
            queryClient.setQueryData(agenticKey("central", id), central)
            void queryClient.invalidateQueries({ queryKey: agenticKey("centrals") })
            toast.success("Central salva")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível salvar a central")),
    })
}

export function useDeleteCentral() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (id: string) => unwrapApi((await api.delete<ApiResponse<{ deleted: boolean }>>(`/agentic/centrals/${id}`)).data),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: agenticKey("centrals") })
            toast.success("Central excluída")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível excluir a central")),
    })
}

export function useTestCentral(id: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async () => unwrapApi((await api.post<ApiResponse<CentralTestOutcome>>(`/agentic/centrals/${id}/test`)).data),
        onSuccess: (result) => {
            void queryClient.invalidateQueries({ queryKey: agenticKey("central", id) })
            if (result.ok) toast.success(result.message)
            else toast.error(result.message)
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível testar a central")),
    })
}

export const useCentralWorkbenches = (centralId: string | null) =>
    useQuery({ queryKey: agenticKey("workbenches", centralId), queryFn: () => get<WorkbenchSummaryDto[]>(`/agentic/centrals/${centralId}/workbenches`), enabled: Boolean(centralId) })

export const useWorkbenchByTask = (taskId: string | null) =>
    useQuery({ queryKey: agenticKey("workbench", taskId), queryFn: () => get<WorkbenchDto | null>(`/agentic/workbenches/by-task/${taskId}`), enabled: Boolean(taskId) })

function useSetWorkbench() {
    const queryClient = useQueryClient()
    return (workbench: WorkbenchDto) => {
        queryClient.setQueryData(agenticKey("workbench", workbench.taskId), workbench)
        void queryClient.invalidateQueries({ queryKey: agenticKey("workbenches", workbench.centralId) })
    }
}

export function useStartWorkbench() {
    const setWorkbench = useSetWorkbench()
    return useMutation({
        mutationFn: async (input: { centralId: string; taskId: string }) => unwrapApi((await api.post<ApiResponse<WorkbenchDto>>("/agentic/workbenches", input)).data),
        onSuccess: (workbench) => {
            setWorkbench(workbench)
            toast.success("Mesa aberta: o planejamento começou")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível abrir a mesa")),
    })
}

const ACTION_TOASTS: Partial<Record<WorkbenchAction, string>> = {
    "revise-plan": "Correção enviada ao planejador",
    implement: "Implementação iniciada",
    "request-correction": "Correção enviada ao planejador",
    approve: "Abrindo o Pull Request",
    "submit-pr-feedback": "Mudanças enviadas ao planejador",
    reopen: "Mesa reaberta",
    interrupt: "Interrompendo o agente",
}

/** Ações da mesa com resposta otimista (a mesa entra em "executando" na hora). */
export function useWorkbenchAction(workbench: WorkbenchDto | null | undefined) {
    const queryClient = useQueryClient()
    const setWorkbench = useSetWorkbench()
    return useMutation({
        mutationFn: async ({ action, text }: { action: WorkbenchAction; text?: string }) =>
            unwrapApi((await api.post<ApiResponse<WorkbenchDto>>(`/agentic/workbenches/${workbench!.id}/actions/${action}`, text === undefined ? {} : { text })).data),
        onMutate: async ({ action }) => {
            if (!workbench || action === "interrupt") return { previous: workbench }
            const key = agenticKey("workbench", workbench.taskId)
            await queryClient.cancelQueries({ queryKey: key })
            queryClient.setQueryData<WorkbenchDto | null>(key, (current) => (current ? { ...current, runState: "running", error: null } : current))
            return { previous: workbench }
        },
        onError: (error, _vars, context) => {
            if (context?.previous) queryClient.setQueryData(agenticKey("workbench", context.previous.taskId), context.previous)
            toast.error(apiErrorMessage(error, "Não foi possível executar a ação"))
        },
        onSuccess: (saved, { action }) => {
            setWorkbench(saved)
            const message = ACTION_TOASTS[action]
            if (message) toast.success(message)
        },
    })
}

export function useReplyPermission(workbench: WorkbenchDto) {
    const setWorkbench = useSetWorkbench()
    return useMutation({
        mutationFn: async ({ requestId, ...input }: PermissionReplyInput & { requestId: string }) =>
            unwrapApi((await api.post<ApiResponse<WorkbenchDto>>(`/agentic/workbenches/${workbench.id}/permissions/${encodeURIComponent(requestId)}`, input)).data),
        onSuccess: setWorkbench,
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível responder ao pedido")),
    })
}

export function useReplyForm(workbench: WorkbenchDto) {
    const setWorkbench = useSetWorkbench()
    return useMutation({
        mutationFn: async ({ formId, ...input }: FormReplyInput & { formId: string }) =>
            unwrapApi((await api.post<ApiResponse<WorkbenchDto>>(`/agentic/workbenches/${workbench.id}/forms/${encodeURIComponent(formId)}`, input)).data),
        onSuccess: setWorkbench,
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível enviar a resposta")),
    })
}

export function useDeleteWorkbench() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (workbench: WorkbenchDto) => {
            await api.delete(`/agentic/workbenches/${workbench.id}`)
            return workbench
        },
        onSuccess: (workbench) => {
            queryClient.setQueryData(agenticKey("workbench", workbench.taskId), null)
            void queryClient.invalidateQueries({ queryKey: agenticKey("workbenches", workbench.centralId) })
            toast.success("Mesa excluída")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível excluir a mesa")),
    })
}

/** Centrais, mesas ou configuração alteradas no servidor: recarrega. */
export function useAgenticRealtime(): void {
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!isPusherClientAvailable()) return
        const name = appChannel()
        const channel = acquireChannel(name)
        const handler = () => void queryClient.invalidateQueries({ queryKey: [AGENTIC_QUERY_KEY] })
        channel.bind(AGENTIC_UPDATED_EVENT, handler)
        return () => {
            channel.unbind(AGENTIC_UPDATED_EVENT, handler)
            releaseChannel(name)
        }
    }, [queryClient])
}
