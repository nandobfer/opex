"use client"

import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import { appChannel } from "@/lib/pusher/channel-names"
import { TASK_COLUMNS_UPDATED_EVENT, TASKS_UPDATED_EVENT } from "../constants"
import type { CreateTaskInput, UpdateTaskInput } from "../schemas"
import type { TaskDetailDto, TaskDto, TaskListDto, TaskOptionsDto, TasksUpdatedEvent } from "../types"

/** Tarefas dO Opex: consultas, mutações (otimistas) e atualização em tempo real. */

export const TASKS_QUERY_KEY = "tasks"
export const taskListKey = (includeArchived: boolean) => [TASKS_QUERY_KEY, "list", { includeArchived }] as const
export const taskDetailKey = (id: string) => [TASKS_QUERY_KEY, "detail", id] as const
export const taskOptionsKey = [TASKS_QUERY_KEY, "options"] as const

export function useTaskList(includeArchived: boolean, enabled = true) {
    return useQuery({
        queryKey: taskListKey(includeArchived),
        queryFn: async () => unwrapApi((await api.get<ApiResponse<TaskListDto>>("/tasks", { params: includeArchived ? { includeArchived: true } : {} })).data),
        enabled,
        staleTime: 30_000,
    })
}

export function useTaskOptions(enabled = true) {
    return useQuery({
        queryKey: taskOptionsKey,
        queryFn: async () => unwrapApi((await api.get<ApiResponse<TaskOptionsDto>>("/tasks/options")).data),
        enabled,
        staleTime: 5 * 60_000,
    })
}

export function useTaskDetail(id: string) {
    return useQuery({
        queryKey: taskDetailKey(id),
        queryFn: async () => unwrapApi((await api.get<ApiResponse<TaskDetailDto>>(`/tasks/${id}`)).data),
    })
}

/** Recarrega tarefas quando o servidor avisa mudança (outra aba, rotina, IA). */
export function useTasksRealtime(): void {
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!isPusherClientAvailable()) return
        const name = appChannel()
        const channel = acquireChannel(name)
        const handler = (event: TasksUpdatedEvent) => {
            void queryClient.invalidateQueries({ queryKey: [TASKS_QUERY_KEY, "list"] })
            for (const id of event?.ids ?? []) void queryClient.invalidateQueries({ queryKey: taskDetailKey(id) })
        }
        const onColumns = () => {
            void queryClient.invalidateQueries({ queryKey: [TASKS_QUERY_KEY, "board"] })
            void queryClient.invalidateQueries({ queryKey: [TASKS_QUERY_KEY, "list"] })
        }
        channel.bind(TASKS_UPDATED_EVENT, handler)
        channel.bind(TASK_COLUMNS_UPDATED_EVENT, onColumns)
        return () => {
            channel.unbind(TASKS_UPDATED_EVENT, handler)
            channel.unbind(TASK_COLUMNS_UPDATED_EVENT, onColumns)
            releaseChannel(name)
        }
    }, [queryClient])
}

export interface MoveTaskVariables {
    task: Pick<TaskDto, "id" | "code" | "columnId">
    /** Coluna de destino. */
    target: string
    /** Nome da coluna de destino (toast). */
    targetLabel: string
    order?: number
}

type Snapshot = [QueryKey, unknown][]

/**
 * Move a tarefa com resposta otimista: o card muda na hora em todas as listas e no detalhe; se o
 * servidor recusar, tudo volta.
 */
export function useMoveTask() {
    const queryClient = useQueryClient()
    return useMutation<TaskDto | null, unknown, MoveTaskVariables, Snapshot>({
        mutationFn: async ({ task, target, order }) => unwrapApi((await api.post<ApiResponse<TaskDto | null>>(`/tasks/${task.id}/move`, { targetColumn: target, order })).data),
        onMutate: async ({ task, target, order }) => {
            await queryClient.cancelQueries({ queryKey: [TASKS_QUERY_KEY] })
            const snapshot: Snapshot = [...queryClient.getQueriesData({ queryKey: [TASKS_QUERY_KEY, "list"] }), ...queryClient.getQueriesData({ queryKey: taskDetailKey(task.id) })]
            const patch = <T extends TaskDto>(item: T): T =>
                item.id !== task.id ? item : { ...item, columnId: target, order: order ?? Number.MAX_SAFE_INTEGER }
            queryClient.setQueriesData<TaskListDto>({ queryKey: [TASKS_QUERY_KEY, "list"] }, (data) => (data ? { ...data, tasks: data.tasks.map(patch) } : data))
            queryClient.setQueryData<TaskDetailDto>(taskDetailKey(task.id), (data) => (data ? patch(data) : data))
            return snapshot
        },
        onError: (error, _variables, snapshot) => {
            for (const [key, data] of snapshot ?? []) queryClient.setQueryData(key, data)
            toast.error(apiErrorMessage(error, "Não foi possível mover a tarefa"))
        },
        onSuccess: (_task, { task, target, targetLabel }) => {
            if (task.columnId !== target) toast.success(`${task.code} movida para ${targetLabel}`)
        },
        onSettled: (_data, _error, { task }) => {
            void queryClient.invalidateQueries({ queryKey: [TASKS_QUERY_KEY, "list"] })
            void queryClient.invalidateQueries({ queryKey: taskDetailKey(task.id) })
        },
    })
}

/** Aplica alterações parciais por id em todas as listas e detalhes em cache (resposta otimista). */
export function patchTasksInCache(queryClient: ReturnType<typeof useQueryClient>, patches: ReadonlyMap<string, Partial<TaskDto>>): void {
    if (patches.size === 0) return
    const patch = <T extends TaskDto>(item: T): T => {
        const change = patches.get(item.id)
        return change ? { ...item, ...change } : item
    }
    queryClient.setQueriesData<TaskListDto>({ queryKey: [TASKS_QUERY_KEY, "list"] }, (data) => (data ? { ...data, tasks: data.tasks.map(patch) } : data))
    for (const id of patches.keys()) queryClient.setQueryData<TaskDetailDto>(taskDetailKey(id), (data) => (data ? patch(data) : data))
}

export interface UpdateTaskVariables {
    task: Pick<TaskDto, "id" | "code">
    body: UpdateTaskInput
    /** Alteração otimista na tela. */
    patch?: Partial<TaskDto>
    /** Mensagem de sucesso (sem: nenhum toast). */
    success?: string
}

/** Edita campos de UMA tarefa (`PATCH /api/tasks/[id]`), otimista. */
export function useUpdateTask() {
    const queryClient = useQueryClient()
    return useMutation<unknown, unknown, UpdateTaskVariables, Snapshot>({
        mutationFn: async ({ task, body }) => unwrapApi((await api.patch<ApiResponse<{ id: string }>>(`/tasks/${task.id}`, body)).data),
        onMutate: async ({ task, patch }) => {
            await queryClient.cancelQueries({ queryKey: [TASKS_QUERY_KEY] })
            const snapshot: Snapshot = [...queryClient.getQueriesData({ queryKey: [TASKS_QUERY_KEY, "list"] }), ...queryClient.getQueriesData({ queryKey: taskDetailKey(task.id) })]
            if (patch) patchTasksInCache(queryClient, new Map([[task.id, patch]]))
            return snapshot
        },
        onError: (error, _variables, snapshot) => {
            for (const [key, data] of snapshot ?? []) queryClient.setQueryData(key, data)
            toast.error(apiErrorMessage(error, "Não foi possível atualizar a tarefa"))
        },
        onSuccess: (_data, { success }) => {
            if (success) toast.success(success)
        },
        onSettled: (_data, _error, { task }) => {
            void queryClient.invalidateQueries({ queryKey: [TASKS_QUERY_KEY, "list"] })
            void queryClient.invalidateQueries({ queryKey: taskDetailKey(task.id) })
        },
    })
}

/** Cria uma tarefa (`POST /api/tasks`). */
export function useCreateTask() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: CreateTaskInput) => unwrapApi((await api.post<ApiResponse<TaskDto>>("/tasks", input)).data),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível criar a tarefa")),
        onSuccess: (task) => {
            void queryClient.invalidateQueries({ queryKey: [TASKS_QUERY_KEY, "list"] })
            toast.success(`Tarefa ${task.code} criada`)
        },
    })
}

/** Exclui a tarefa (`DELETE /api/tasks/[id]`). */
export function useDeleteTask() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (task: Pick<TaskDto, "id" | "code">) => unwrapApi((await api.delete<ApiResponse<{ id: string }>>(`/tasks/${task.id}`)).data),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível excluir a tarefa")),
        onSuccess: (_data, task) => {
            void queryClient.invalidateQueries({ queryKey: [TASKS_QUERY_KEY] })
            toast.success(`Tarefa ${task.code} excluída`)
        },
    })
}

/** Adiciona um comentário (`POST /api/tasks/[id]/comments`). */
export function useAddComment(taskId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (content: string) => unwrapApi((await api.post<ApiResponse<{ id: string }>>(`/tasks/${taskId}/comments`, { content })).data),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível comentar")),
        onSuccess: () => void queryClient.invalidateQueries({ queryKey: taskDetailKey(taskId) }),
    })
}
