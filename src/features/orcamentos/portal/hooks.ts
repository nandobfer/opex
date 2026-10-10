"use client"

import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query"
import { toast } from "sonner"
import { apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import type { TaskPriority } from "@/features/tasks/constants"
import type { TaskDto } from "@/features/tasks/types"
import type { ClienteDraftInput } from "../schemas"
import type { ClientePortalOptionsDto, ClienteTaskDetailDto, ClienteTaskDto, ClienteTaskListDto, OrcamentoDraftDto } from "../types"
import { useClientePortal } from "./ClientePortalContext"

/** Consultas e mutações do portal do cliente (axios autenticado pelo token). */

export const CLIENTE_QUERY_KEY = "cliente"
const optionsKey = [CLIENTE_QUERY_KEY, "options"] as const
const tasksKey = (includeArchived: boolean) => [CLIENTE_QUERY_KEY, "tasks", { includeArchived }] as const
const taskKey = (id: string) => [CLIENTE_QUERY_KEY, "task", id] as const
const draftKey = (id: string) => [CLIENTE_QUERY_KEY, "draft", id] as const

export function useClienteOptions() {
    const { api } = useClientePortal()
    return useQuery({
        queryKey: optionsKey,
        queryFn: async () => unwrapApi((await api.get<ApiResponse<ClientePortalOptionsDto>>("/cliente/options")).data),
        staleTime: 5 * 60_000,
    })
}

export function useClienteTasks(includeArchived: boolean) {
    const { api } = useClientePortal()
    return useQuery({
        queryKey: tasksKey(includeArchived),
        queryFn: async () => unwrapApi((await api.get<ApiResponse<ClienteTaskListDto>>("/cliente/tasks", { params: includeArchived ? { includeArchived: true } : {} })).data),
        staleTime: 15_000,
    })
}

/** Detalhe da tarefa na visão do cliente (só as que ele solicitou). */
export function useClienteTask(id: string) {
    const { api } = useClientePortal()
    return useQuery({
        queryKey: taskKey(id),
        queryFn: async () => unwrapApi((await api.get<ApiResponse<ClienteTaskDetailDto>>(`/cliente/tasks/${id}`)).data),
    })
}

/** Comentário do cliente numa tarefa do portal. */
export function useAddClienteComment(taskId: string) {
    const { api } = useClientePortal()
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (content: string) => unwrapApi((await api.post<ApiResponse<{ id: string }>>(`/cliente/tasks/${taskId}/comments`, { content })).data),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível comentar")),
        onSuccess: () => void queryClient.invalidateQueries({ queryKey: taskKey(taskId) }),
    })
}

interface SetClientePriorityVariables {
    task: Pick<ClienteTaskDto, "id" | "code">
    priority: TaskPriority
}

type PrioritySnapshot = [QueryKey, unknown][]

/**
 * Edita a prioridade de uma tarefa do cliente (`PATCH /cliente/tasks/[id]`), com resposta otimista:
 * a lista e o detalhe mudam na hora e revertem se o servidor recusar.
 */
export function useSetClienteTaskPriority() {
    const { api } = useClientePortal()
    const queryClient = useQueryClient()
    return useMutation<unknown, unknown, SetClientePriorityVariables, PrioritySnapshot>({
        mutationFn: async ({ task, priority }) => unwrapApi((await api.patch<ApiResponse<{ id: string }>>(`/cliente/tasks/${task.id}`, { priority })).data),
        onMutate: async ({ task, priority }) => {
            await queryClient.cancelQueries({ queryKey: [CLIENTE_QUERY_KEY] })
            const snapshot: PrioritySnapshot = [...queryClient.getQueriesData({ queryKey: [CLIENTE_QUERY_KEY, "tasks"] }), ...queryClient.getQueriesData({ queryKey: taskKey(task.id) })]
            const patch = <T extends { id: string; priority: TaskPriority }>(item: T): T => (item.id === task.id ? { ...item, priority } : item)
            queryClient.setQueriesData<ClienteTaskListDto>({ queryKey: [CLIENTE_QUERY_KEY, "tasks"] }, (data) => (data ? { ...data, tasks: data.tasks.map(patch) } : data))
            queryClient.setQueryData<ClienteTaskDetailDto>(taskKey(task.id), (data) => (data ? patch(data) : data))
            return snapshot
        },
        onError: (error, _variables, snapshot) => {
            for (const [key, data] of snapshot ?? []) queryClient.setQueryData(key, data)
            toast.error(apiErrorMessage(error, "Não foi possível atualizar a prioridade"))
        },
        onSuccess: (_data, { task }) => toast.success(`Prioridade de ${task.code} atualizada`),
        onSettled: (_data, _error, { task }) => {
            void queryClient.invalidateQueries({ queryKey: [CLIENTE_QUERY_KEY, "tasks"] })
            void queryClient.invalidateQueries({ queryKey: taskKey(task.id) })
        },
    })
}

export function useClienteDraft(id: string) {
    const { api } = useClientePortal()
    return useQuery({
        queryKey: draftKey(id),
        queryFn: async () => unwrapApi((await api.get<ApiResponse<OrcamentoDraftDto>>(`/cliente/drafts/${id}`)).data),
    })
}

export function useCreateDraft() {
    const { api } = useClientePortal()
    return useMutation({
        mutationFn: async (input: ClienteDraftInput) => unwrapApi((await api.post<ApiResponse<OrcamentoDraftDto>>("/cliente/drafts", input)).data),
    })
}

export function useSetCorrection(id: string) {
    const { api } = useClientePortal()
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (correction: string) => unwrapApi((await api.post<ApiResponse<OrcamentoDraftDto>>(`/cliente/drafts/${id}/correction`, { correction })).data),
        onSuccess: (draft) => queryClient.setQueryData(draftKey(id), draft),
    })
}

export function useApproveDraft(id: string) {
    const { api } = useClientePortal()
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (priority?: TaskPriority) => unwrapApi((await api.post<ApiResponse<TaskDto>>(`/cliente/drafts/${id}/approve`, priority ? { priority } : {})).data),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: [CLIENTE_QUERY_KEY, "tasks"] })
            void queryClient.invalidateQueries({ queryKey: draftKey(id) })
        },
    })
}
