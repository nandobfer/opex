"use client"

import { useEffect } from "react"
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import { appChannel } from "@/lib/pusher/channel-names"
import { TIME_UPDATED_EVENT, type StopTimerInput, type UpdateTimeLogInput } from "../schemas"
import type { TimeLogDto, TimeLogPageDto, TimeUpdatedEvent } from "../types"

/** Controle de horas (local): consultas, iniciar/parar/editar/excluir e tempo real. */

export const TIME_QUERY_KEY = "time"
export const activeTimersKey = [TIME_QUERY_KEY, "active"] as const
export const timeLogsKey = (from: string, to: string) => [TIME_QUERY_KEY, "logs", { from, to }] as const

export function useActiveTimers(enabled = true) {
    return useQuery({
        queryKey: activeTimersKey,
        queryFn: async () => unwrapApi((await api.get<ApiResponse<TimeLogDto[]>>("/time/active")).data),
        enabled,
        staleTime: 30_000,
    })
}

export function useTimeLogs(range: { from: string; to: string }) {
    return useInfiniteQuery({
        queryKey: timeLogsKey(range.from, range.to),
        queryFn: async ({ pageParam }) =>
            unwrapApi((await api.get<ApiResponse<TimeLogPageDto>>("/time/logs", { params: { from: range.from, to: range.to, page: pageParam } })).data),
        initialPageParam: 1,
        getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
    })
}

/** Recarrega timers, apontamentos e o detalhe das tarefas afetadas quando o servidor avisa. */
export function useTimeRealtime(): void {
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!isPusherClientAvailable()) return
        const name = appChannel()
        const channel = acquireChannel(name)
        const handler = (event: TimeUpdatedEvent) => {
            void queryClient.invalidateQueries({ queryKey: [TIME_QUERY_KEY] })
            for (const id of event?.taskIds ?? []) void queryClient.invalidateQueries({ queryKey: ["tasks", "detail", id] })
        }
        channel.bind(TIME_UPDATED_EVENT, handler)
        return () => {
            channel.unbind(TIME_UPDATED_EVENT, handler)
            releaseChannel(name)
        }
    }, [queryClient])
}

function useRefreshTime() {
    const queryClient = useQueryClient()
    return (taskId?: string | null) => {
        void queryClient.invalidateQueries({ queryKey: [TIME_QUERY_KEY] })
        if (taskId) void queryClient.invalidateQueries({ queryKey: ["tasks", "detail", taskId] })
    }
}

export interface StartVariables {
    taskId: string
    taskCode: string
    taskTitle: string
}

/** Inicia com resposta otimista (o timer já aparece rodando; some se o servidor recusar). */
export function useStartTimer() {
    const queryClient = useQueryClient()
    const refresh = useRefreshTime()
    return useMutation<TimeLogDto, unknown, StartVariables, TimeLogDto[] | undefined>({
        mutationFn: async ({ taskId }) => unwrapApi((await api.post<ApiResponse<TimeLogDto>>("/time/start", { taskId })).data),
        onMutate: async ({ taskId, taskCode, taskTitle }) => {
            await queryClient.cancelQueries({ queryKey: activeTimersKey })
            const previous = queryClient.getQueryData<TimeLogDto[]>(activeTimersKey)
            const optimistic: TimeLogDto = {
                id: `pending-${taskId}`,
                taskId,
                taskCode,
                taskTitle,
                startTime: new Date().toISOString(),
                endTime: null,
                duration: null,
                description: null,
                active: true,
            }
            queryClient.setQueryData<TimeLogDto[]>(activeTimersKey, [optimistic, ...(previous ?? [])])
            return previous
        },
        onError: (error, _variables, previous) => {
            queryClient.setQueryData(activeTimersKey, previous)
            toast.error(apiErrorMessage(error, "Não foi possível iniciar o timer"))
        },
        onSuccess: (log, { taskCode }) => {
            queryClient.setQueryData<TimeLogDto[]>(activeTimersKey, (data) => [log, ...(data ?? []).filter((item) => item.id !== `pending-${log.taskId}` && item.id !== log.id)])
            toast.success(`Timer iniciado em ${log.taskCode ?? taskCode}`)
        },
        onSettled: (_log, _error, { taskId }) => refresh(taskId),
    })
}

export interface StopVariables extends StopTimerInput {
    log: TimeLogDto
}

/** Para o timer; some na hora da lista de ativos (volta se o servidor recusar). */
export function useStopTimer() {
    const queryClient = useQueryClient()
    const refresh = useRefreshTime()
    return useMutation<TimeLogDto, unknown, StopVariables, TimeLogDto[] | undefined>({
        mutationFn: async ({ log, ...input }) => unwrapApi((await api.post<ApiResponse<TimeLogDto>>(`/time/${log.id}/stop`, input)).data),
        onMutate: async ({ log }) => {
            await queryClient.cancelQueries({ queryKey: activeTimersKey })
            const previous = queryClient.getQueryData<TimeLogDto[]>(activeTimersKey)
            queryClient.setQueryData<TimeLogDto[]>(activeTimersKey, (previous ?? []).filter((item) => item.id !== log.id))
            return previous
        },
        onError: (_error, _variables, previous) => queryClient.setQueryData(activeTimersKey, previous),
        onSettled: (_log, _error, { log }) => refresh(log.taskId),
    })
}

export function useUpdateTimeLog() {
    const refresh = useRefreshTime()
    return useMutation<unknown, unknown, { log: TimeLogDto; input: UpdateTimeLogInput }>({
        mutationFn: async ({ log, input }) => unwrapApi((await api.patch<ApiResponse<{ id: string }>>(`/time/${log.id}`, input)).data),
        onSuccess: (_data, { input }) => toast.success(input.kind === "description" ? "Descrição salva" : "Período atualizado"),
        onSettled: (_data, _error, { log }) => refresh(log.taskId),
    })
}

export function useDeleteTimeLog() {
    const refresh = useRefreshTime()
    return useMutation<unknown, unknown, { log: TimeLogDto }>({
        mutationFn: async ({ log }) => unwrapApi((await api.delete<ApiResponse<{ id: string }>>(`/time/${log.id}`)).data),
        onSuccess: () => toast.success("Apontamento excluído"),
        onSettled: (_data, _error, { log }) => refresh(log.taskId),
    })
}
