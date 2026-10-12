"use client"

import { useEffect, useMemo } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import { appChannel } from "@/lib/pusher/channel-names"
import { TASKS_UPDATED_EVENT } from "@/features/tasks/constants"
import { TASKS_QUERY_KEY } from "@/features/tasks/hooks/useTasks"
import { ORCAMENTOS_UPDATED_EVENT } from "@/features/orcamentos/constants"
import { orcamentoClientsKey } from "@/features/orcamentos/hooks/useOrcamentos"
import { FINANCE_PATH } from "../schemas"
import { financeHttpParams, financeQuery, type FinanceFilters, type FinanceQueryParams } from "../filters"
import type { FinanceByClientDto } from "../types"

/**
 * Visão Financeiro (somente leitura): faturamento das tarefas concluídas por cliente, por período e
 * filtros de cliente/repositório.
 */

export const FINANCE_QUERY_KEY = "finance"
export const financeByClientKey = (query: FinanceQueryParams) => [FINANCE_QUERY_KEY, "by-client", query] as const

/** Consulta o financeiro com o período e as seleções de cliente/repositório dos filtros. */
export function useFinanceByClient(filters: FinanceFilters) {
    const query = useMemo(() => financeQuery(filters), [filters])
    return useQuery({
        queryKey: financeByClientKey(query),
        queryFn: async () => unwrapApi((await api.get<ApiResponse<FinanceByClientDto>>(FINANCE_PATH, { params: financeHttpParams(query) })).data),
    })
}

/**
 * Recarrega o financeiro (e as opções dos filtros) quando tarefas ou clientes mudam — o servidor
 * avisa pelo Pusher. Nunca publica eventos.
 */
export function useFinanceRealtime(): void {
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!isPusherClientAvailable()) return
        const name = appChannel()
        const channel = acquireChannel(name)
        const invalidate = () => {
            void queryClient.invalidateQueries({ queryKey: [FINANCE_QUERY_KEY] })
            void queryClient.invalidateQueries({ queryKey: orcamentoClientsKey })
            void queryClient.invalidateQueries({ queryKey: [TASKS_QUERY_KEY, "options"] })
        }
        channel.bind(TASKS_UPDATED_EVENT, invalidate)
        channel.bind(ORCAMENTOS_UPDATED_EVENT, invalidate)
        return () => {
            channel.unbind(TASKS_UPDATED_EVENT, invalidate)
            channel.unbind(ORCAMENTOS_UPDATED_EVENT, invalidate)
            releaseChannel(name)
        }
    }, [queryClient])
}
