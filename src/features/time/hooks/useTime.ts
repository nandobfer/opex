"use client"

import { useEffect } from "react"
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query"
import { api, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import { appChannel } from "@/lib/pusher/channel-names"
import { TASKS_UPDATED_EVENT, type TaskType } from "@/features/tasks/constants"
import { TIME_UPDATED_EVENT } from "../schemas"
import type { TimeLogDto, TimeLogPageDto, TimeUpdatedEvent } from "../types"

/**
 * Controle de horas agêntico (somente leitura): consultas de períodos ativos, apontamentos e tempo
 * real. Nada aqui altera os apontamentos — quem os abre/fecha é o servidor, a partir da mesa.
 */

export const TIME_QUERY_KEY = "time"
export const activeTimersKey = [TIME_QUERY_KEY, "active"] as const
export const timeLogsQueryKey = [TIME_QUERY_KEY, "logs"] as const

/** Recorte dos apontamentos: período (ISO) + repositórios + tipos de tarefa. */
export interface TimeLogsQuery {
    from: string
    to: string
    /** Ids dos projetos (repositórios vinculados). */
    projects: string[]
    /** Tipos de tarefa. */
    types: TaskType[]
}

export const timeLogsKey = (query: TimeLogsQuery) => [...timeLogsQueryKey, query] as const

/** Recorte enviado à API como CSV; ausente quando não há seleção. */
function timeLogFilterParams(query: Pick<TimeLogsQuery, "projects" | "types">): Record<string, string> {
    const params: Record<string, string> = {}
    if (query.projects.length) params.projects = query.projects.join(",")
    if (query.types.length) params.types = query.types.join(",")
    return params
}

export function useActiveTimers(enabled = true) {
    return useQuery({
        queryKey: activeTimersKey,
        queryFn: async () => unwrapApi((await api.get<ApiResponse<TimeLogDto[]>>("/time/active")).data),
        enabled,
        staleTime: 30_000,
    })
}

export function useTimeLogs(query: TimeLogsQuery) {
    return useInfiniteQuery({
        queryKey: timeLogsKey(query),
        queryFn: async ({ pageParam }) =>
            unwrapApi(
                (
                    await api.get<ApiResponse<TimeLogPageDto>>("/time/logs", {
                        params: { from: query.from, to: query.to, page: pageParam, ...timeLogFilterParams(query) },
                    })
                ).data,
            ),
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
        // Mudar o repositório ou o tipo da tarefa (ou excluí-la) muda o que os filtros das Horas devolvem.
        const onTasks = () => void queryClient.invalidateQueries({ queryKey: [...timeLogsQueryKey] })
        channel.bind(TIME_UPDATED_EVENT, handler)
        channel.bind(TASKS_UPDATED_EVENT, onTasks)
        return () => {
            channel.unbind(TIME_UPDATED_EVENT, handler)
            channel.unbind(TASKS_UPDATED_EVENT, onTasks)
            releaseChannel(name)
        }
    }, [queryClient])
}
