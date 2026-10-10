"use client"

import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { GITHUB_ISSUE_SYNC_JOB_ID, integrationDebugChannel } from "@/lib/integrations/catalog"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import { TASKS_QUERY_KEY } from "@/features/tasks/hooks/useTasks"
import { GITHUB_UPDATED_EVENT, type GithubUpdateScope } from "../constants"
import type { MappingInput, RepoLinkInput } from "../schemas"
import type { GithubLabelOption, GithubLinkDto, GithubMappingDto, GithubRepoOption, GithubSyncStatusDto } from "../types"

/** Consultas e mutações da integração GitHub (abas da página `/integracoes/github`). */

export const GITHUB_QUERY_KEY = "github"
const key = (...parts: unknown[]) => [GITHUB_QUERY_KEY, ...parts] as const

const get = async <T,>(path: string, params?: Record<string, string>) => unwrapApi((await api.get<ApiResponse<T>>(path, { params })).data)

export const useGithubLinks = () => useQuery({ queryKey: key("links"), queryFn: () => get<GithubLinkDto[]>("/integrations/github/links") })
export const useGithubRepos = (enabled: boolean) =>
    useQuery({ queryKey: key("repos"), queryFn: () => get<GithubRepoOption[]>("/integrations/github/repos"), enabled, staleTime: 5 * 60_000, retry: false })
export const useGithubLabels = (enabled: boolean) =>
    useQuery({ queryKey: key("labels"), queryFn: () => get<GithubLabelOption[]>("/integrations/github/labels"), enabled, staleTime: 5 * 60_000, retry: false })
export const useGithubIssueTypes = (enabled: boolean) =>
    useQuery({ queryKey: key("issue-types"), queryFn: () => get<string[]>("/integrations/github/issue-types"), enabled, staleTime: 5 * 60_000, retry: false })
export const useGithubMapping = () => useQuery({ queryKey: key("mappings"), queryFn: () => get<GithubMappingDto>("/integrations/github/mappings") })
export const useGithubSyncStatus = () =>
    useQuery({ queryKey: key("sync"), queryFn: () => get<GithubSyncStatusDto>("/integrations/github/sync"), refetchInterval: 30_000, refetchIntervalInBackground: false })

function useInvalidate() {
    const queryClient = useQueryClient()
    return (...parts: string[]) => {
        for (const part of parts) void queryClient.invalidateQueries({ queryKey: key(part) })
    }
}

const onError = (fallback: string) => (error: unknown) => toast.error(apiErrorMessage(error, fallback))

export function useSaveLink() {
    const invalidate = useInvalidate()
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async ({ id, input }: { id: string | null; input: RepoLinkInput }) =>
            unwrapApi((id ? await api.patch<ApiResponse<GithubLinkDto>>(`/integrations/github/links/${id}`, input) : await api.post<ApiResponse<GithubLinkDto>>("/integrations/github/links", input)).data),
        onSuccess: (link, { id }) => {
            toast.success(id ? `Vínculo de ${link.repo} salvo` : `${link.repo} vinculado`)

            invalidate("links", "sync")
            void queryClient.invalidateQueries({ queryKey: [TASKS_QUERY_KEY, "options"] })
        },
        onError: onError("Não foi possível salvar o vínculo"),
    })
}

export function useDeleteLink() {
    const invalidate = useInvalidate()
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (link: GithubLinkDto) => {
            await api.delete(`/integrations/github/links/${link.id}`)
        },
        onSuccess: (_data, link) => {
            toast.success(`Vínculo de ${link.repo} removido`)
            invalidate("links", "sync")
            void queryClient.invalidateQueries({ queryKey: [TASKS_QUERY_KEY, "options"] })
        },
        onError: onError("Não foi possível remover o vínculo"),
    })
}

export function useSaveMapping() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: MappingInput) => unwrapApi((await api.put<ApiResponse<GithubMappingDto>>("/integrations/github/mappings", input)).data),
        onSuccess: (mapping) => {
            queryClient.setQueryData(key("mappings"), mapping)
            toast.success("Mapeamento salvo")
        },
        onError: onError("Não foi possível salvar o mapeamento"),
    })
}

export function useRunGithubSync() {
    const invalidate = useInvalidate()
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async () => unwrapApi((await api.post<ApiResponse<{ ok: boolean; message: string; durationMs: number }>>(`/integrations/crons/jobs/${GITHUB_ISSUE_SYNC_JOB_ID}/run`)).data),
        onSuccess: (result) => {
            if (result.ok) toast.success("Sincronização concluída", { description: result.message.slice(0, 300) })
            else toast.error("A sincronização falhou", { description: result.message.slice(0, 300) })
        },
        onError: onError("Não foi possível sincronizar agora"),
        onSettled: () => {
            invalidate("sync", "links")
            void queryClient.invalidateQueries({ queryKey: [TASKS_QUERY_KEY, "list"] })
        },
    })
}

/** Abas da integração recarregam quando o servidor avisa mudança (Pusher). */
export function useGithubRealtime(): void {
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!isPusherClientAvailable()) return
        const name = integrationDebugChannel("github")
        const channel = acquireChannel(name)
        const handler = (event: { scope?: GithubUpdateScope }) => {
            const scope = event?.scope
            void queryClient.invalidateQueries({ queryKey: scope ? key(scope) : [GITHUB_QUERY_KEY] })
            if (scope === "sync") void queryClient.invalidateQueries({ queryKey: key("links") })
        }
        channel.bind(GITHUB_UPDATED_EVENT, handler)
        return () => {
            channel.unbind(GITHUB_UPDATED_EVENT, handler)
            releaseChannel(name)
        }
    }, [queryClient])
}
