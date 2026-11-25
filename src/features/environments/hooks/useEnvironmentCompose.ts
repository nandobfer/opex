"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { ENVIRONMENTS_QUERY_KEY } from "../constants"
import type { ComposeSaveInput } from "../schemas"
import type { ComposeRevisionDto, EnvironmentComposeDto } from "../types"
import { environmentsKey } from "./useEnvironments"

/** Compose gerenciado (OPE-191): revisões de um ambiente. O tempo real invalida pelo prefixo do módulo. */

const composeKey = (id: string | null) => [ENVIRONMENTS_QUERY_KEY, "compose", id] as const

export const useEnvironmentCompose = (id: string | null, enabled: boolean) =>
    useQuery({
        queryKey: composeKey(id),
        enabled: enabled && id !== null,
        queryFn: async () => unwrapApi((await api.get<ApiResponse<EnvironmentComposeDto>>(`/environments/${id}/compose`)).data),
    })

/** Conteúdo de uma revisão (Ver); revisões nunca mudam, então ficam no cache. */
export const useComposeRevision = (id: string | null, version: number | null) =>
    useQuery({
        queryKey: [...composeKey(id), "revision", version] as const,
        enabled: id !== null && version !== null,
        staleTime: Infinity,
        queryFn: async () => unwrapApi((await api.get<ApiResponse<ComposeRevisionDto>>(`/environments/${id}/compose/${version}`)).data),
    })

function useComposeMutation<I>(id: string, request: (input: I) => Promise<ComposeRevisionDto>, fallback: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: request,
        onSuccess: (revision) => {
            // A nova vigente entra na hora (o editor sai da edição sem piscar o conteúdo anterior).
            queryClient.setQueryData<EnvironmentComposeDto>(composeKey(id), (previous) => {
                if (!previous) return previous
                const { content: _content, ...summary } = revision
                void _content
                return { ...previous, current: revision, revisions: [summary, ...previous.revisions.filter((item) => item.version !== revision.version)] }
            })
            void queryClient.invalidateQueries({ queryKey: composeKey(id) })
            void queryClient.invalidateQueries({ queryKey: environmentsKey })
            toast.success(`Revisão v${revision.version} salva: vale a partir do próximo deploy`)
        },
        onError: (error) => toast.error(apiErrorMessage(error, fallback)),
    })
}

export const useSaveCompose = (id: string) =>
    useComposeMutation(id, async (input: ComposeSaveInput) => unwrapApi((await api.put<ApiResponse<ComposeRevisionDto>>(`/environments/${id}/compose`, input)).data), "Não foi possível salvar o compose")

export const useRestoreCompose = (id: string) =>
    useComposeMutation(id, async (version: number) => unwrapApi((await api.post<ApiResponse<ComposeRevisionDto>>(`/environments/${id}/compose/restore`, { version })).data), "Não foi possível restaurar a revisão")
