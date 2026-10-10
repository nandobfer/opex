"use client"

import { useEffect } from "react"
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query"
import { api, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import { appChannel } from "@/lib/pusher/channel-names"
import { TIME_UPDATED_EVENT } from "../schemas"
import type { TimeLogDto, TimeLogPageDto, TimeUpdatedEvent } from "../types"

/**
 * Controle de horas agêntico (somente leitura): consultas de períodos ativos, apontamentos e tempo
 * real. Nada aqui altera os apontamentos — quem os abre/fecha é o servidor, a partir da mesa.
 */

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
