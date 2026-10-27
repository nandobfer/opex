"use client"

import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { appChannel } from "@/lib/pusher/channel-names"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import type { FormReplyInput, PermissionReplyInput } from "@/features/agentic/schemas"
import { REFINEMENT_UPDATED_EVENT, type RefinementAction } from "../constants"
import type { TaskRefinementStateDto } from "../types"

/** Consultas e mutações do refinamento de tarefa. */

export const REFINEMENT_QUERY_KEY = "refinement"
export const refinementKey = (taskId: string) => [REFINEMENT_QUERY_KEY, taskId] as const
const get = async <T,>(path: string) => unwrapApi((await api.get<ApiResponse<T>>(path)).data)

export const useTaskRefinement = (taskId: string, enabled = true) =>
    useQuery({ queryKey: refinementKey(taskId), queryFn: () => get<TaskRefinementStateDto>(`/tasks/${taskId}/refinement`), enabled, staleTime: 10_000 })

function useSetRefinement(taskId: string) {
    const queryClient = useQueryClient()
    return (state: TaskRefinementStateDto) => queryClient.setQueryData(refinementKey(taskId), state)
}

export function useStartRefinement(taskId: string) {
    const set = useSetRefinement(taskId)
    return useMutation({
        mutationFn: async () => unwrapApi((await api.post<ApiResponse<TaskRefinementStateDto>>(`/tasks/${taskId}/refinement`)).data),
        onSuccess: set,
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível iniciar o refinamento")),
    })
}

export function useReplyRefinementForm(taskId: string) {
    const set = useSetRefinement(taskId)
    return useMutation({
        mutationFn: async ({ formId, ...input }: FormReplyInput & { formId: string }) =>
            unwrapApi((await api.post<ApiResponse<TaskRefinementStateDto>>(`/tasks/${taskId}/refinement/forms/${encodeURIComponent(formId)}`, input)).data),
        onSuccess: set,
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível enviar a resposta")),
    })
}

export function useReplyRefinementPermission(taskId: string) {
    const set = useSetRefinement(taskId)
    return useMutation({
        mutationFn: async ({ requestId, ...input }: PermissionReplyInput & { requestId: string }) =>
            unwrapApi((await api.post<ApiResponse<TaskRefinementStateDto>>(`/tasks/${taskId}/refinement/permissions/${encodeURIComponent(requestId)}`, input)).data),
        onSuccess: set,
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível responder ao pedido")),
    })
}

export function useRefinementAction(taskId: string) {
    const set = useSetRefinement(taskId)
    return useMutation({
        mutationFn: async (action: RefinementAction) => unwrapApi((await api.post<ApiResponse<TaskRefinementStateDto>>(`/tasks/${taskId}/refinement/actions/${action}`)).data),
        onSuccess: set,
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível executar a ação")),
    })
}

/** Chat durante a execução: mensagem que entra no turno de refinamento em andamento. */
export function useSendRefinementMessage(taskId: string) {
    const set = useSetRefinement(taskId)
    return useMutation({
        mutationFn: async (text: string) => unwrapApi((await api.post<ApiResponse<TaskRefinementStateDto>>(`/tasks/${taskId}/refinement/messages`, { text })).data),
        onSuccess: (state) => {
            set(state)
            toast.success("Mensagem enviada ao agente")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível enviar a mensagem ao agente")),
    })
}

/**
 * Reconectar ao turno do refinamento (attach à mesma sessão). Sem toast próprio: as tentativas
 * automáticas do ciclo de reconexão são silenciosas.
 */
export function useRefinementReconnect(taskId: string) {
    const set = useSetRefinement(taskId)
    return useMutation({
        mutationFn: async () => unwrapApi((await api.post<ApiResponse<TaskRefinementStateDto>>(`/tasks/${taskId}/refinement/actions/reconnect`)).data),
        onSuccess: set,
    })
}

/** Estado do refinamento mudou no servidor (outra aba, turnos): recarrega. */
export function useRefinementRealtime(taskId: string): void {
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!isPusherClientAvailable()) return
        const name = appChannel()
        const channel = acquireChannel(name)
        const handler = (event: { taskId?: string }) => {
            if (!event?.taskId || event.taskId === taskId) void queryClient.invalidateQueries({ queryKey: refinementKey(taskId) })
        }
        channel.bind(REFINEMENT_UPDATED_EVENT, handler)
        return () => {
            channel.unbind(REFINEMENT_UPDATED_EVENT, handler)
            releaseChannel(name)
        }
    }, [queryClient, taskId])
}
