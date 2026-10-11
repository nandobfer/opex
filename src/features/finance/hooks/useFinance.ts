"use client"

import { useEffect } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import { appChannel } from "@/lib/pusher/channel-names"
import { TASKS_UPDATED_EVENT } from "@/features/tasks/constants"
import { ORCAMENTOS_UPDATED_EVENT } from "@/features/orcamentos/constants"
import type { FinanceByClientDto } from "../types"

/**
 * Visão Financeiro (somente leitura): faturamento das tarefas concluídas por cliente, por período.
 */

export const FINANCE_QUERY_KEY = "finance"
export const financeByClientKey = (from: string, to: string) => [FINANCE_QUERY_KEY, "by-client", { from, to }] as const

export function useFinanceByClient(range: { from: string; to: string }) {
    return useQuery({
        queryKey: financeByClientKey(range.from, range.to),
        queryFn: async () =>
            unwrapApi(
                (
                    await api.get<ApiResponse<FinanceByClientDto>>("/financeiro", {
                        params: { from: range.from || undefined, to: range.to || undefined },
                    })
                ).data,
            ),
    })
}

/** Recarrega o financeiro quando tarefas ou clientes mudam (o servidor avisa pelo Pusher). */
export function useFinanceRealtime(): void {
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!isPusherClientAvailable()) return
        const name = appChannel()
        const channel = acquireChannel(name)
        const invalidate = () => void queryClient.invalidateQueries({ queryKey: [FINANCE_QUERY_KEY] })
        channel.bind(TASKS_UPDATED_EVENT, invalidate)
        channel.bind(ORCAMENTOS_UPDATED_EVENT, invalidate)
        return () => {
            channel.unbind(TASKS_UPDATED_EVENT, invalidate)
            channel.unbind(ORCAMENTOS_UPDATED_EVENT, invalidate)
            releaseChannel(name)
        }
    }, [queryClient])
}
