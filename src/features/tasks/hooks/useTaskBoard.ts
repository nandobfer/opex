"use client"

import { useMemo } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { buildBoardColumns, type CustomColumnDto, type TaskBoardDto } from "../board"
import type { ColumnInput, CreateColumnInput } from "../schemas"
import { TASKS_QUERY_KEY } from "./useTasks"

/** Colunas do quadro (Go! Sipal + customizadas) e as mutações das customizadas. */

export const taskBoardKey = [TASKS_QUERY_KEY, "board"] as const

export function useTaskBoard(enabled = true) {
    const query = useQuery({
        queryKey: taskBoardKey,
        queryFn: async () => unwrapApi((await api.get<ApiResponse<TaskBoardDto>>("/tasks/columns")).data),
        enabled,
        staleTime: 60_000,
    })
    const columns = useMemo(() => buildBoardColumns(query.data), [query.data])
    return { ...query, columns }
}

export function useColumnMutations() {
    const queryClient = useQueryClient()
    const refresh = () => void queryClient.invalidateQueries({ queryKey: taskBoardKey })

    const create = useMutation({
        mutationFn: async (input: CreateColumnInput) => unwrapApi((await api.post<ApiResponse<CustomColumnDto>>("/tasks/columns", input)).data),
        onSuccess: (column) => toast.success(`Coluna "${column.name}" criada`),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível criar a coluna")),
        onSettled: refresh,
    })

    const update = useMutation({
        mutationFn: async ({ key, input }: { key: string; input: ColumnInput }) => unwrapApi((await api.patch<ApiResponse<CustomColumnDto>>(`/tasks/columns/${key}`, input)).data),
        onMutate: async ({ key, input }) => {
            await queryClient.cancelQueries({ queryKey: taskBoardKey })
            const previous = queryClient.getQueryData<TaskBoardDto>(taskBoardKey)
            queryClient.setQueryData<TaskBoardDto>(taskBoardKey, (data) =>
                data ? { ...data, columns: data.columns.map((column) => (column.key === key ? { ...column, ...input, description: input.description.trim() || null } : column)) } : data,
            )
            return previous
        },
        onError: (error, _variables, previous) => {
            if (previous) queryClient.setQueryData(taskBoardKey, previous)
            toast.error(apiErrorMessage(error, "Não foi possível salvar a coluna"))
        },
        onSuccess: (column) => toast.success(`Coluna "${column.name}" salva`),
        onSettled: refresh,
    })

    const remove = useMutation({
        mutationFn: async (column: CustomColumnDto) => unwrapApi((await api.delete<ApiResponse<{ key: string }>>(`/tasks/columns/${column.key}`)).data),
        onMutate: async (column) => {
            await queryClient.cancelQueries({ queryKey: taskBoardKey })
            const previous = queryClient.getQueryData<TaskBoardDto>(taskBoardKey)
            queryClient.setQueryData<TaskBoardDto>(taskBoardKey, (data) =>
                data ? { columns: data.columns.filter((item) => item.key !== column.key), layout: data.layout.filter((key) => key !== column.key) } : data,
            )
            return previous
        },
        onError: (error, _column, previous) => {
            if (previous) queryClient.setQueryData(taskBoardKey, previous)
            toast.error(apiErrorMessage(error, "Não foi possível excluir a coluna"))
        },
        onSuccess: (_data, column) => toast.success(`Coluna "${column.name}" excluída`),
        onSettled: refresh,
    })

    /** Nova ordem (otimista: as colunas já ficam no lugar; volta se o servidor recusar). */
    const reorder = useMutation({
        mutationFn: async (order: string[]) => unwrapApi((await api.put<ApiResponse<TaskBoardDto>>("/tasks/columns/order", { order })).data),
        onMutate: async (order) => {
            await queryClient.cancelQueries({ queryKey: taskBoardKey })
            const previous = queryClient.getQueryData<TaskBoardDto>(taskBoardKey)
            queryClient.setQueryData<TaskBoardDto>(taskBoardKey, (data) => (data ? { ...data, layout: order } : data))
            return previous
        },
        onError: (error, _order, previous) => {
            if (previous) queryClient.setQueryData(taskBoardKey, previous)
            toast.error(apiErrorMessage(error, "Não foi possível reorganizar as colunas"))
        },
        onSettled: refresh,
    })

    return { create, update, remove, reorder }
}
