"use client"

import { useEffect } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import { appChannel } from "@/lib/pusher/channel-names"
import { AGENTIC_UPDATED_EVENT } from "@/features/agentic/constants"
import { ORCAMENTOS_UPDATED_EVENT } from "@/features/orcamentos/constants"
import { TASKS_UPDATED_EVENT, TASK_COLUMNS_UPDATED_EVENT } from "@/features/tasks/constants"
import { TIME_UPDATED_EVENT } from "@/features/time/schemas"
import type { DashboardDto } from "../types"

/**
 * Tela Dashboards (somente leitura): um único endpoint agregado por período e fuso. Os eventos já
 * publicados pelo servidor (tarefas/colunas/horas/agêntico/orçamentos) invalidam a consulta.
 */

export const DASHBOARD_QUERY_KEY = "dashboard"
export const dashboardKey = (from: string, to: string, timeZone: string) => [DASHBOARD_QUERY_KEY, { from, to, timeZone }] as const

export function useDashboard(range: { from: string; to: string; timeZone: string }, enabled = true) {
    return useQuery({
        queryKey: dashboardKey(range.from, range.to, range.timeZone),
        queryFn: async () =>
            unwrapApi(
                (
                    await api.get<ApiResponse<DashboardDto>>("/dashboard", {
                        params: { from: range.from || undefined, to: range.to || undefined, timeZone: range.timeZone || undefined },
                    })
                ).data,
            ),
        enabled,
    })
}

/** Recarrega o dashboard quando tarefas, colunas, horas, mesas ou clientes mudam (Pusher). */
export function useDashboardRealtime(): void {
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!isPusherClientAvailable()) return
        const name = appChannel()
        const channel = acquireChannel(name)
        const invalidate = () => void queryClient.invalidateQueries({ queryKey: [DASHBOARD_QUERY_KEY] })
        const events = [TASKS_UPDATED_EVENT, TASK_COLUMNS_UPDATED_EVENT, TIME_UPDATED_EVENT, AGENTIC_UPDATED_EVENT, ORCAMENTOS_UPDATED_EVENT]
        for (const event of events) channel.bind(event, invalidate)
        return () => {
            for (const event of events) channel.unbind(event, invalidate)
            releaseChannel(name)
        }
    }, [queryClient])
}
