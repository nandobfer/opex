"use client"

import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorCode, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import { appChannel } from "@/lib/pusher/channel-names"
import axios from "axios"
import { isCustomColumnKey } from "../board"
import { TASK_COLUMNS_UPDATED_EVENT, TASK_PRIORITY_LABELS, TASKS_UPDATED_EVENT, type RequiredUrl, type TaskPriority, type TaskStatus } from "../constants"
import type { MoveTaskInput, UpdateTaskInput } from "../schemas"
import type { PersonRef, TaskDetailDto, TaskDto, TaskListDto, TaskOptionsDto, TasksUpdatedEvent } from "../types"

/** Tarefas do Go! Sipal: consultas, mudança de status (otimista) e atualização em tempo real. */

export const TASKS_QUERY_KEY = "tasks"
export const taskListKey = (includeArchived: boolean) => [TASKS_QUERY_KEY, "list", { includeArchived }] as const
export const taskDetailKey = (id: string) => [TASKS_QUERY_KEY, "detail", id] as const
export const taskOptionsKey = [TASKS_QUERY_KEY, "options"] as const

/** Erro de sessão do Go! Sipal (sem token ou token recusado): a tela oferece reconectar. */
export const isSessionError = (error: unknown) => apiErrorCode(error) === "GO_SIPAL_SESSION"

export function useTaskList(includeArchived: boolean, enabled = true) {
    return useQuery({
        queryKey: taskListKey(includeArchived),
        queryFn: async () => unwrapApi((await api.get<ApiResponse<TaskListDto>>("/tasks", { params: includeArchived ? { includeArchived: true } : {} })).data),
        enabled,
        staleTime: 30_000,
        retry: (count, error) => !isSessionError(error) && count < 2,
    })
}

export function useTaskOptions(enabled = true) {
    return useQuery({
        queryKey: taskOptionsKey,
        queryFn: async () => unwrapApi((await api.get<ApiResponse<TaskOptionsDto>>("/tasks/options")).data),
        enabled,
        staleTime: 5 * 60_000,
        retry: (count, error) => !isSessionError(error) && count < 2,
    })
}

export function useTaskDetail(id: string) {
    return useQuery({
        queryKey: taskDetailKey(id),
        queryFn: async () => unwrapApi((await api.get<ApiResponse<TaskDetailDto>>(`/tasks/${id}`)).data),
        retry: (count, error) => !isSessionError(error) && apiErrorCode(error) !== "TASK_NOT_FOUND" && count < 2,
    })
}

/** Recarrega tarefas quando o servidor avisa mudança (rotina de sincronização ou outra aba). */
export function useTasksRealtime(): void {
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!isPusherClientAvailable()) return
        const name = appChannel()
        const channel = acquireChannel(name)
        const handler = (event: TasksUpdatedEvent) => {
            void queryClient.invalidateQueries({ queryKey: [TASKS_QUERY_KEY, "list"] })
            for (const id of event?.ids ?? []) {
                void queryClient.invalidateQueries({ queryKey: taskDetailKey(id) })
                // Rascunhos (issues do GitHub) têm o próprio detalhe (`useDraftDetail`).
                if (id.startsWith("draft-")) void queryClient.invalidateQueries({ queryKey: [TASKS_QUERY_KEY, "draft", id] })
            }
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
    task: Pick<TaskDto, "id" | "code" | "status" | "localColumn">
    /** Status do Go! Sipal ou chave de coluna customizada (`custom-…`). */
    target: string
    /** Nome da coluna de destino (toast). */
    targetLabel: string
    order?: number
    commitUrl?: string
    pullRequestUrl?: string
}

/** Falha ao mover: mensagem pt-BR e, se for o caso, qual URL a plataforma exige. */
export interface MoveTaskFailure {
    message: string
    requires: RequiredUrl | null
}

export function moveFailureOf(error: unknown): MoveTaskFailure {
    const details = axios.isAxiosError(error) ? (error.response?.data as { details?: { requiresCommitUrl?: boolean; requiresPullRequestUrl?: boolean } } | undefined)?.details : undefined
    return {
        message: apiErrorMessage(error, "Não foi possível mover a tarefa"),
        requires: details?.requiresCommitUrl ? "commit" : details?.requiresPullRequestUrl ? "pullRequest" : null,
    }
}

type Snapshot = [QueryKey, unknown][]

/**
 * Move a tarefa com resposta otimista: o card muda na hora em todas as listas e no detalhe; se a
 * plataforma recusar, tudo volta (animado pelo layout dos cards) e o chamador decide o que mostrar
 * (toast ou diálogo de URL). `silent` deixa o toast de erro com o chamador.
 */
export function useMoveTask() {
    const queryClient = useQueryClient()
    return useMutation<TaskDto | null, unknown, MoveTaskVariables, Snapshot>({
        mutationFn: async ({ task, target, order, commitUrl, pullRequestUrl }) => {
            const body: MoveTaskInput = isCustomColumnKey(target)
                ? { targetColumn: target, order, fromStatus: task.status, code: task.code }
                : { targetStatus: target as TaskStatus, order, commitUrl, pullRequestUrl, fromStatus: task.status, code: task.code }
            return unwrapApi((await api.post<ApiResponse<TaskDto | null>>(`/tasks/${task.id}/move`, body)).data)
        },
        onMutate: async ({ task, target, order, commitUrl, pullRequestUrl }) => {
            await queryClient.cancelQueries({ queryKey: [TASKS_QUERY_KEY] })
            const snapshot: Snapshot = [
                ...queryClient.getQueriesData({ queryKey: [TASKS_QUERY_KEY, "list"] }),
                ...queryClient.getQueriesData({ queryKey: taskDetailKey(task.id) }),
            ]
            const custom = isCustomColumnKey(target)
            const patch = <T extends TaskDto>(item: T): T =>
                item.id !== task.id
                    ? item
                    : custom
                      ? { ...item, localColumn: target, localOrder: order ?? Number.MAX_SAFE_INTEGER }
                      : {
                            ...item,
                            status: target as TaskStatus,
                            localColumn: null,
                            localOrder: null,
                            order: order ?? item.order,
                            commitUrl: commitUrl ?? item.commitUrl,
                            pullRequestUrl: pullRequestUrl ?? item.pullRequestUrl,
                        }
            queryClient.setQueriesData<TaskListDto>({ queryKey: [TASKS_QUERY_KEY, "list"] }, (data) => (data ? { ...data, tasks: data.tasks.map(patch) } : data))
            queryClient.setQueryData<TaskDetailDto>(taskDetailKey(task.id), (data) => (data ? patch(data) : data))
            return snapshot
        },
        onError: (_error, _variables, snapshot) => {
            for (const [key, data] of snapshot ?? []) queryClient.setQueryData(key, data)
        },
        onSuccess: (_task, { task, target, targetLabel }) => {
            if ((task.localColumn ?? task.status) !== target) toast.success(`${task.code} movida para ${targetLabel}`)
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
    task: Pick<TaskDto, "id" | "code" | "assignee" | "priority">
    /** `assignee: null` remove o responsável. */
    assignee?: PersonRef | null
    priority?: TaskPriority
}

/**
 * Responsável/prioridade de UMA tarefa (`PATCH /api/tasks/[id]`), otimista: muda na hora e volta
 * se o Go! Sipal recusar (toast com o motivo).
 */
export function useUpdateTask() {
    const queryClient = useQueryClient()
    return useMutation<unknown, unknown, UpdateTaskVariables, Snapshot>({
        mutationFn: async ({ task, assignee, priority }) => {
            const body: UpdateTaskInput = {
                code: task.code,
                from: { assignee: task.assignee?.id ?? null, assigneeName: task.assignee?.name ?? null, assigneeNameAfter: assignee === undefined ? undefined : (assignee?.name ?? null), priority: task.priority },
                ...(assignee !== undefined ? { assignee: assignee?.id ?? null } : {}),
                ...(priority !== undefined ? { priority } : {}),
            }
            return unwrapApi((await api.patch<ApiResponse<{ id: string }>>(`/tasks/${task.id}`, body)).data)
        },
        onMutate: async ({ task, assignee, priority }) => {
            await queryClient.cancelQueries({ queryKey: [TASKS_QUERY_KEY] })
            const snapshot: Snapshot = [...queryClient.getQueriesData({ queryKey: [TASKS_QUERY_KEY, "list"] }), ...queryClient.getQueriesData({ queryKey: taskDetailKey(task.id) })]
            const change: Partial<TaskDto> = {}
            if (assignee !== undefined) change.assignee = assignee
            if (priority !== undefined) change.priority = priority
            patchTasksInCache(queryClient, new Map([[task.id, change]]))
            return snapshot
        },
        onError: (error, _variables, snapshot) => {
            for (const [key, data] of snapshot ?? []) queryClient.setQueryData(key, data)
            toast.error(apiErrorMessage(error, "Não foi possível atualizar a tarefa"))
        },
        onSuccess: (_data, { task, assignee, priority }) => {
            if (assignee !== undefined) toast.success(assignee ? `${task.code} atribuída a ${assignee.name}` : `${task.code} sem responsável`)
            else if (priority) toast.success(`${task.code} com prioridade ${TASK_PRIORITY_LABELS[priority].toLowerCase()}`)
        },
        onSettled: (_data, _error, { task }) => {
            void queryClient.invalidateQueries({ queryKey: [TASKS_QUERY_KEY, "list"] })
            void queryClient.invalidateQueries({ queryKey: taskDetailKey(task.id) })
        },
    })
}
