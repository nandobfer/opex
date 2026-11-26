"use client"

import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import { useOpexScope } from "../components/OpexScopeProvider"
import { OPEX_WATCH_UPDATED_EVENT, isActiveWatchStatus, type OpexWatchDto, type OpexWatchFilter } from "../watches"
import type { OpexJobOriginFilter } from "../jobs"

/**
 * Observações de evento do Agente Opex na interface (OPE-194). Tudo passa pelo escopo (`useOpexScope`):
 * a aba Observações vive no app do dono (`/opex/watches`); a faixa "Observando…" do chat usa a rota da
 * sessão no escopo (dono ou portal).
 */

export interface OpexWatchesQuery {
    filter: OpexWatchFilter
    origin?: OpexJobOriginFilter
    clientId?: string | null
}

export const opexWatchesKey = (prefix: string) => [prefix, "watches"] as const
const listKey = (prefix: string, query: OpexWatchesQuery) => [...opexWatchesKey(prefix), "list", query.filter, query.origin ?? "all", query.clientId ?? null] as const
export const opexSessionWatchesKey = (prefix: string, sessionId: string) => [...opexWatchesKey(prefix), "session", sessionId] as const

export function useOpexWatches(query: OpexWatchesQuery) {
    const { http, apiBase, queryPrefix } = useOpexScope()
    return useQuery({
        queryKey: listKey(queryPrefix, query),
        queryFn: async () =>
            unwrapApi((await http.get<ApiResponse<OpexWatchDto[]>>(`${apiBase}/watches`, { params: { filter: query.filter, origin: query.origin ?? "all", ...(query.clientId ? { clientId: query.clientId } : {}) } })).data),
        staleTime: 15_000,
    })
}

/** Observações ativas de uma sessão (faixa "Observando…"). */
export function useOpexSessionWatches(sessionId: string, enabled = true) {
    const { http, apiBase, queryPrefix } = useOpexScope()
    return useQuery({
        queryKey: opexSessionWatchesKey(queryPrefix, sessionId),
        queryFn: async () => unwrapApi((await http.get<ApiResponse<OpexWatchDto[]>>(`${apiBase}/sessions/${sessionId}/watches`)).data),
        enabled,
        staleTime: 15_000,
    })
}

/** Cancela com resposta otimista (sai das listas de ativas na hora; volta com toast se falhar). */
export function useCancelOpexWatch() {
    const queryClient = useQueryClient()
    const { http, apiBase, queryPrefix } = useOpexScope()
    const key = opexWatchesKey(queryPrefix)
    return useMutation({
        mutationFn: async (id: string) => unwrapApi((await http.delete<ApiResponse<OpexWatchDto>>(`${apiBase}/watches/${id}`)).data),
        onMutate: async (id) => {
            await queryClient.cancelQueries({ queryKey: key })
            const previous = queryClient.getQueriesData<OpexWatchDto[]>({ queryKey: key })
            for (const [queryKey, list] of previous) {
                const parts = queryKey as readonly unknown[]
                // Sessão e "Ativas": a observação sai; "Encerradas"/"Todas": vira cancelada.
                const activeOnly = parts[2] === "session" || parts[3] === "active"
                queryClient.setQueryData<OpexWatchDto[]>(queryKey, activeOnly ? list?.filter((watch) => watch.id !== id) : list?.map((watch) => (watch.id === id ? { ...watch, status: "canceled" } : watch)))
            }
            return { previous }
        },
        onSuccess: () => toast.success("Observação cancelada"),
        onError: (error, _id, context) => {
            for (const [queryKey, data] of context?.previous ?? []) queryClient.setQueryData(queryKey, data)
            toast.error(apiErrorMessage(error, "Não foi possível cancelar a observação"))
        },
        onSettled: () => void queryClient.invalidateQueries({ queryKey: key }),
    })
}

/** Listas de observações ao vivo: qualquer mudança só invalida e relê. */
export function useOpexWatchesRealtime(enabled: boolean): void {
    const queryClient = useQueryClient()
    const { channel: name, queryPrefix } = useOpexScope()
    useEffect(() => {
        if (!enabled || !isPusherClientAvailable()) return
        const channel = acquireChannel(name)
        const handler = () => void queryClient.invalidateQueries({ queryKey: opexWatchesKey(queryPrefix) })
        channel.bind(OPEX_WATCH_UPDATED_EVENT, handler)
        return () => {
            channel.unbind(OPEX_WATCH_UPDATED_EVENT, handler)
            releaseChannel(name)
        }
    }, [enabled, queryClient, name, queryPrefix])
}

export const activeWatches = (watches: readonly OpexWatchDto[] | undefined) => (watches ?? []).filter((watch) => isActiveWatchStatus(watch.status))
