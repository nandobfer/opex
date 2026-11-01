"use client"

import { useEffect } from "react"
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorCode, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { appChannel } from "@/lib/pusher/channel-names"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import { ENGRAMIND_QUERY_KEY, ENGRAMIND_UPDATED_EVENT } from "../constants"

/**
 * Base dos hooks do Engramind: tudo passa pelas rotas `/api/engramind/**` do Opex (axios do projeto,
 * sem prefixar `/api`). Chave: `["engramind", <1º segmento da rota>, rota, parâmetros]`, invalidada
 * pelo prefixo no tempo real (`useEngramindRealtime`).
 */

export type Params = Record<string, string | number | boolean | undefined | null>

const clean = (params: Params = {}) => Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ""))
export const engramindKey = (route: string, params?: Params): QueryKey => [ENGRAMIND_QUERY_KEY, route.split("/")[0], route, clean(params)]
export const areaKey = (area: string): QueryKey => [ENGRAMIND_QUERY_KEY, area]

/** Caminho do Opex com os segmentos codificados (`channels/eng%2Fglobal/stats`). */
export const route = (...segments: (string | number)[]) => segments.map((segment) => encodeURIComponent(String(segment))).join("/")

export async function engramindGet<T>(path: string, params?: Params): Promise<T> {
    return unwrapApi((await api.get<ApiResponse<T>>(`/engramind/${path}`, { params: clean(params) })).data)
}

export async function engramindSend<T>(method: "post" | "put" | "patch" | "delete", path: string, body?: unknown): Promise<T> {
    const response = method === "delete" ? await api.delete<ApiResponse<T>>(`/engramind/${path}`) : await api[method]<ApiResponse<T>>(`/engramind/${path}`, body ?? {})
    return unwrapApi(response.data)
}

/** Consulta simples de uma rota do Engramind. */
export function useEngramindQuery<T>(path: string | null, params?: Params, options: { enabled?: boolean; /** Número, `false` ou função dos dados atuais (ex.: polling só enquanto algo carrega). */ refetchInterval?: number | false | ((data: T | undefined) => number | false) } = {}) {
    const interval = options.refetchInterval
    return useQuery({
        queryKey: engramindKey(path ?? "-", params),
        queryFn: () => engramindGet<T>(path!, params),
        enabled: path !== null && options.enabled !== false,
        refetchInterval: typeof interval === "function" ? (query) => interval(query.state.data as T | undefined) : interval,
        retry: (count, error) => count < 1 && apiErrorCode(error) !== "ENGRAMIND_NOT_CONFIGURED",
    })
}

/** Lista paginada por cursor (`next_cursor`). `field` é o nome da lista na resposta do Engramind. */
export function useEngramindList<T>(path: string | null, field: string, params?: Params, options: { enabled?: boolean; /** Lê todas as páginas (listas pequenas, como apps e tokens). */ all?: boolean } = {}) {
    const query = useInfiniteQuery({
        queryKey: [...engramindKey(path ?? "-", params), "pages"],
        initialPageParam: null as string | null,
        queryFn: async ({ pageParam }) => {
            const page = await engramindGet<Record<string, unknown>>(path!, { ...params, cursor: pageParam ?? undefined, limit: 100 })
            return { items: (page[field] as T[] | undefined) ?? [], nextCursor: (page.next_cursor as string | null | undefined) ?? null, truncated: page.truncated === true }
        },
        getNextPageParam: (last) => last.nextCursor,
        enabled: path !== null && options.enabled !== false,
        retry: (count, error) => count < 1 && apiErrorCode(error) !== "ENGRAMIND_NOT_CONFIGURED",
    })
    const { hasNextPage, isFetchingNextPage, fetchNextPage } = query
    useEffect(() => {
        if (options.all && hasNextPage && !isFetchingNextPage) void fetchNextPage()
    }, [options.all, hasNextPage, isFetchingNextPage, fetchNextPage])
    const items = query.data?.pages.flatMap((page) => page.items) ?? []
    return { ...query, items }
}

interface MutationOptions<V> {
    /** Áreas (1º segmento) a invalidar no sucesso. */
    invalidate: string[]
    success?: string | ((variables: V) => string)
    /** Não mostra o toast de erro (o chamador mostra no formulário). */
    silentError?: boolean
    /** Outras chaves a invalidar (ex.: o detalhe da integração). */
    alsoInvalidate?: readonly QueryKey[]
}

/** Mutação numa rota do Engramind, com toast pt-BR e invalidação das áreas afetadas. */
export function useEngramindMutation<V, T = unknown>(request: (variables: V) => Promise<T>, options: MutationOptions<V>) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: request,
        onSuccess: (_data, variables) => {
            for (const area of options.invalidate) void queryClient.invalidateQueries({ queryKey: areaKey(area) })
            for (const queryKey of options.alsoInvalidate ?? []) void queryClient.invalidateQueries({ queryKey })
            const message = typeof options.success === "function" ? options.success(variables) : options.success
            if (message) toast.success(message)
        },
        onError: (error) => {
            if (!options.silentError) toast.error(apiErrorMessage(error, "Não foi possível concluir a ação no Engramind."))
        },
    })
}

/** Áreas a invalidar por tipo de evento (`engramind-updated`). */
export function areasForEvent(type: string): string[] {
    if (type.startsWith("memory.")) return ["memories", "channels"]
    if (type === "channel.updated") return ["channels", "memories"]
    if (type === "subscription.updated") return ["subscriptions", "agents"]
    if (type === "settings.updated") return ["settings", "channels", "status", "providers"]
    if (type === "identities.updated") return ["apps", "agents", "tokens", "connection"]
    if (type === "jobs.updated" || type === "status.updated") return ["jobs", "status"]
    if (type.startsWith("env.")) return ["env", "status", "connection"]
    if (type === "migration.updated") return ["migration"]
    return []
}

/** Tempo real: `engramind-updated` em `private-app` invalida as telas afetadas. */
export function useEngramindRealtime(): void {
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!isPusherClientAvailable()) return
        const name = appChannel()
        const channel = acquireChannel(name)
        const handler = (payload: { type?: string }) => {
            for (const area of areasForEvent(payload?.type ?? "")) void queryClient.invalidateQueries({ queryKey: areaKey(area) })
        }
        channel.bind(ENGRAMIND_UPDATED_EVENT, handler)
        return () => {
            channel.unbind(ENGRAMIND_UPDATED_EVENT, handler)
            releaseChannel(name)
        }
    }, [queryClient])
}

/** Erro que pede reconfigurar a conexão (token inválido/insuficiente ou sem configuração). */
export function needsReconnect(error: unknown): "configure" | "token" | null {
    const code = apiErrorCode(error)
    if (code === "ENGRAMIND_NOT_CONFIGURED") return "configure"
    if (code === "ENGRAMIND_AUTH_INVALID" || code === "ENGRAMIND_SCOPE_REQUIRED" || code === "ENGRAMIND_TOKEN_INSUFFICIENT") return "token"
    return null
}
