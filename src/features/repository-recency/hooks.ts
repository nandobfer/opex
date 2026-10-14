"use client"

import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { AxiosInstance } from "axios"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import type { ApiResponse } from "@/lib/types/api"
import { OWNER_REPO_RECENTS_PATH, REPO_RECENTS_UPDATED_EVENT } from "./constants"
import type { RepoRecentsDto } from "./types"

/**
 * Histórico de repositórios usados recentemente no cliente. O mesmo núcleo serve o dono e o portal,
 * mudando só o axios e o par (rota, escopo) — o escopo separa o cache do dono do cache de cada
 * cliente em escopo no portal.
 */

export const REPO_RECENTS_QUERY_KEY = "repo-recents"
const OWNER_SCOPE = "owner"
const EMPTY: readonly string[] = []

const recentsKey = (scope: string) => [REPO_RECENTS_QUERY_KEY, scope] as const

export interface RepoRecentsSource {
    /** Ids dos repositórios, do mais recente para o mais antigo. */
    recents: readonly string[]
    /** Registra a escolha do repositório (otimista; reverte com aviso se o servidor recusar). */
    record: (projectId: string) => void
}

/** Núcleo compartilhado: consulta, registro otimista e assinatura do canal privado do ator. */
export function useRepoRecentsSource(apiClient: AxiosInstance, path: string, scope: string): RepoRecentsSource {
    const queryClient = useQueryClient()
    const query = useQuery({
        queryKey: recentsKey(scope),
        queryFn: async () => unwrapApi((await apiClient.get<ApiResponse<RepoRecentsDto>>(path)).data),
        staleTime: 5 * 60_000,
    })
    const channel = query.data?.channel

    const mutation = useMutation<RepoRecentsDto, unknown, string, { previous?: RepoRecentsDto }>({
        mutationFn: async (projectId) => unwrapApi((await apiClient.post<ApiResponse<RepoRecentsDto>>(path, { projectId })).data),
        onMutate: async (projectId) => {
            await queryClient.cancelQueries({ queryKey: recentsKey(scope) })
            const previous = queryClient.getQueryData<RepoRecentsDto>(recentsKey(scope))
            // Resposta otimista: o repositório escolhido passa a ser o primeiro da lista.
            if (previous) queryClient.setQueryData<RepoRecentsDto>(recentsKey(scope), { ...previous, projectIds: [projectId, ...previous.projectIds.filter((id) => id !== projectId)] })
            return { previous }
        },
        onError: (error, _projectId, context) => {
            if (context?.previous) queryClient.setQueryData(recentsKey(scope), context.previous)
            toast.error(apiErrorMessage(error, "Não foi possível registrar o uso do repositório"))
        },
        // O servidor devolve a lista já ordenada: nada de invalidar (evita um GET por escolha).
        onSuccess: (data) => queryClient.setQueryData(recentsKey(scope), data),
    })

    useEffect(() => {
        if (!channel || !isPusherClientAvailable()) return
        const subscribed = acquireChannel(channel)
        const handler = () => void queryClient.invalidateQueries({ queryKey: recentsKey(scope) })
        subscribed.bind(REPO_RECENTS_UPDATED_EVENT, handler)
        return () => {
            subscribed.unbind(REPO_RECENTS_UPDATED_EVENT, handler)
            releaseChannel(channel)
        }
    }, [channel, scope, queryClient])

    return { recents: query.data?.projectIds ?? EMPTY, record: mutation.mutate }
}

/**
 * Histórico do **dono**, compartilhado pelos filtros de Tarefas, o formulário de tarefa e o
 * formulário de prévia do Opex.
 */
export function useOwnerRepoRecents(): RepoRecentsSource {
    return useRepoRecentsSource(api, OWNER_REPO_RECENTS_PATH, OWNER_SCOPE)
}
