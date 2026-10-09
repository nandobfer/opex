"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorCode, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import type { SendDraftInput, UpdateDraftInput } from "@/features/github/schemas"
import type { SendDraftResultDto, TaskDraftDetailDto } from "@/features/github/types"
import { TASK_STATUS_LABELS, type TaskStatus } from "../constants"
import type { TaskDto } from "../types"
import { UNDO_TOAST_MS } from "./useBulkTasks"
import { TASKS_QUERY_KEY } from "./useTasks"

/** Rascunhos (issues do GitHub): detalhe, edição, envio ao Go! Sipal, descarte e restauração. */

export const draftDetailKey = (id: string) => [TASKS_QUERY_KEY, "draft", id] as const

export function useDraftDetail(id: string, enabled = true) {
    return useQuery({
        queryKey: draftDetailKey(id),
        queryFn: async () => unwrapApi((await api.get<ApiResponse<TaskDraftDetailDto>>(`/tasks/drafts/${id}`)).data),
        enabled,
        retry: (count, error) => apiErrorCode(error) !== "DRAFT_NOT_FOUND" && count < 2,
    })
}

function useRefreshTasks() {
    const queryClient = useQueryClient()
    return (id?: string) => {
        void queryClient.invalidateQueries({ queryKey: [TASKS_QUERY_KEY, "list"] })
        if (id) void queryClient.invalidateQueries({ queryKey: draftDetailKey(id) })
    }
}

export function useUpdateDraft(id: string) {
    const queryClient = useQueryClient()
    const refresh = useRefreshTasks()
    return useMutation({
        mutationFn: async (input: UpdateDraftInput) => unwrapApi((await api.patch<ApiResponse<TaskDto>>(`/tasks/drafts/${id}`, input)).data),
        onMutate: async (input) => {
            await queryClient.cancelQueries({ queryKey: draftDetailKey(id) })
            const previous = queryClient.getQueryData<TaskDraftDetailDto>(draftDetailKey(id))
            const { restore, ...changes } = input
            void restore
            if (previous) {
                queryClient.setQueryData<TaskDraftDetailDto>(draftDetailKey(id), {
                    ...previous,
                    ...(changes.title !== undefined ? { title: changes.title } : {}),
                    ...(changes.body !== undefined ? { body: changes.body, previewBody: changes.body } : {}),
                    ...(changes.taskType !== undefined ? { taskType: changes.taskType } : {}),
                    ...(changes.priority !== undefined ? { priority: changes.priority } : {}),
                    ...(changes.assignee !== undefined ? { assignee: changes.assignee ?? null } : {}),
                    ...(changes.workPackage !== undefined ? { workPackage: changes.workPackage ?? null } : {}),
                })
            }
            return previous
        },
        onError: (error, _input, previous) => {
            if (previous) queryClient.setQueryData(draftDetailKey(id), previous)
            toast.error(apiErrorMessage(error, "Não foi possível salvar o rascunho"))
        },
        onSettled: () => refresh(id),
    })
}

export interface SendDraftVariables {
    task: Pick<TaskDto, "id" | "code">
    input: SendDraftInput
}

export function useSendDraft() {
    const refresh = useRefreshTasks()
    return useMutation({
        mutationFn: async ({ task, input }: SendDraftVariables) => unwrapApi((await api.post<ApiResponse<SendDraftResultDto>>(`/tasks/drafts/${task.id}/send`, input)).data),
        onSuccess: (result, { task, input }) => {
            const images = result.images.total ? ` · ${result.images.attached} de ${result.images.total} imagem(ns) anexada(s)` : ""
            toast.success(`${task.code} enviada ao Go! Sipal como ${result.code}`, { description: `Em ${TASK_STATUS_LABELS[input.status as TaskStatus]}${images}${result.commented ? " · comentário na issue" : ""}` })
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível enviar o rascunho")),
        onSettled: (_data, _error, { task }) => refresh(task.id),
    })
}

/** Descarta com "Desfazer" por 8 s (restaura). */
export function useDiscardDraft() {
    const refresh = useRefreshTasks()
    const restore = useRestoreDraftTask()
    return useMutation({
        mutationFn: async (task: Pick<TaskDto, "id" | "code">) => {
            await api.post(`/tasks/drafts/${task.id}/discard`)
        },
        onSuccess: (_data, task) =>
            toast.success(`${task.code} descartado`, { action: { label: "Desfazer", onClick: () => restore.mutate(task) }, duration: UNDO_TOAST_MS }),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível descartar o rascunho")),
        onSettled: (_data, _error, task) => refresh(task.id),
    })
}

export function useRestoreDraftTask() {
    const refresh = useRefreshTasks()
    return useMutation({
        mutationFn: async (task: Pick<TaskDto, "id" | "code">) => {
            await api.post(`/tasks/drafts/${task.id}/restore`)
        },
        onSuccess: (_data, task) => toast.success(`${task.code} voltou para o quadro`),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível restaurar o rascunho")),
        onSettled: (_data, _error, task) => refresh(task.id),
    })
}
