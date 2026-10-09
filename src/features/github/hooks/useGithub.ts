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
import type {
    DiscardedDraftDto,
    GithubLabelOption,
    GithubMappingDto,
    GithubPersonDto,
    GithubRepoLinkDto,
    GithubRepoOption,
    GithubSyncStatusDto,
    GithubUserOption,
} from "../types"

/** Consultas e mutações da integração GitHub (abas da página `/integracoes/github`). */

export const GITHUB_QUERY_KEY = "github"
const key = (...parts: unknown[]) => [GITHUB_QUERY_KEY, ...parts] as const

const get = async <T,>(path: string, params?: Record<string, string>) => unwrapApi((await api.get<ApiResponse<T>>(path, { params })).data)

export interface ProductLinkOption {
    id: string
    name: string
    repo: string | null
    linkedRepo: string | null
}

export const useGithubLinks = () => useQuery({ queryKey: key("links"), queryFn: () => get<GithubRepoLinkDto[]>("/integrations/github/links") })
export const useGithubRepos = (enabled: boolean) =>
    useQuery({ queryKey: key("repos"), queryFn: () => get<GithubRepoOption[]>("/integrations/github/repos"), enabled, staleTime: 5 * 60_000, retry: false })
export const useGithubProducts = (enabled: boolean) =>
    useQuery({ queryKey: key("products"), queryFn: () => get<ProductLinkOption[]>("/integrations/github/products"), enabled, staleTime: 60_000, retry: false })
export const useGithubUsers = (term: string, enabled: boolean) =>
    useQuery({ queryKey: key("users", term), queryFn: () => get<GithubUserOption[]>("/integrations/github/users", { q: term }), enabled, staleTime: 60_000, placeholderData: (previous) => previous, retry: false })
export const useGithubLabels = (enabled: boolean) =>
    useQuery({ queryKey: key("labels"), queryFn: () => get<GithubLabelOption[]>("/integrations/github/labels"), enabled, staleTime: 5 * 60_000, retry: false })
export const useGithubIssueTypes = (enabled: boolean) =>
    useQuery({ queryKey: key("issue-types"), queryFn: () => get<string[]>("/integrations/github/issue-types"), enabled, staleTime: 5 * 60_000, retry: false })
export const useGithubMapping = () => useQuery({ queryKey: key("mappings"), queryFn: () => get<GithubMappingDto>("/integrations/github/mappings") })
export const useGithubPeople = () => useQuery({ queryKey: key("people"), queryFn: () => get<GithubPersonDto[]>("/integrations/github/people") })
export const useGithubSyncStatus = () =>
    useQuery({ queryKey: key("sync"), queryFn: () => get<GithubSyncStatusDto>("/integrations/github/sync"), refetchInterval: 30_000, refetchIntervalInBackground: false })
export const useDiscardedDrafts = () => useQuery({ queryKey: key("drafts"), queryFn: () => get<DiscardedDraftDto[]>("/integrations/github/drafts") })

function useInvalidate() {
    const queryClient = useQueryClient()
    return (...parts: string[]) => {
        for (const part of parts) void queryClient.invalidateQueries({ queryKey: key(part) })
    }
}

const onError = (fallback: string) => (error: unknown) => toast.error(apiErrorMessage(error, fallback))

export function useSaveLink() {
    const invalidate = useInvalidate()
    return useMutation({
        mutationFn: async ({ id, input }: { id: string | null; input: RepoLinkInput }) =>
            unwrapApi((id ? await api.patch<ApiResponse<GithubRepoLinkDto>>(`/integrations/github/links/${id}`, input) : await api.post<ApiResponse<GithubRepoLinkDto>>("/integrations/github/links", input)).data),
        onSuccess: (link, { id }) => {
            toast.success(id ? `Vínculo de ${link.repo} salvo` : `${link.repo} vinculado a ${link.productName}`)
            invalidate("links", "products", "sync", "people")
        },
        onError: onError("Não foi possível salvar o vínculo"),
    })
}

export function useDeleteLink() {
    const invalidate = useInvalidate()
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async ({ link, drafts }: { link: GithubRepoLinkDto; drafts: "keep" | "discard" }) => {
            await api.delete(`/integrations/github/links/${link.id}`, { data: { drafts } })
        },
        onSuccess: (_data, { link, drafts }) => {
            toast.success(`Vínculo de ${link.repo} removido${link.pendingDrafts ? (drafts === "discard" ? `; ${link.pendingDrafts} rascunho(s) descartado(s)` : `; ${link.pendingDrafts} rascunho(s) mantido(s)`) : ""}`)
            invalidate("links", "products", "sync", "drafts")
            void queryClient.invalidateQueries({ queryKey: [TASKS_QUERY_KEY, "list"] })
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
            toast.success("Mapeamento salvo; rascunhos pendentes atualizados")
        },
        onError: onError("Não foi possível salvar o mapeamento"),
    })
}

export function useRefreshPeople() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async () => unwrapApi((await api.post<ApiResponse<GithubPersonDto[]>>("/integrations/github/people")).data),
        onSuccess: (people) => {
            queryClient.setQueryData(key("people"), people)
            toast.success(`${people.length} pessoa(s) do GitHub`)
        },
        onError: onError("Não foi possível atualizar as pessoas"),
    })
}

/** Liga (ou desfaz) login → desenvolvedor, otimista. */
export function useSetPerson() {
    const queryClient = useQueryClient()
    return useMutation<GithubPersonDto, unknown, { login: string; developer: { id: string; name: string } | null }, GithubPersonDto[] | undefined>({
        mutationFn: async ({ login, developer }) =>
            unwrapApi((await api.patch<ApiResponse<GithubPersonDto>>(`/integrations/github/people/${encodeURIComponent(login)}`, { developerId: developer?.id ?? null, developerName: developer?.name ?? null })).data),
        onMutate: async ({ login, developer }) => {
            await queryClient.cancelQueries({ queryKey: key("people") })
            const previous = queryClient.getQueryData<GithubPersonDto[]>(key("people"))
            queryClient.setQueryData<GithubPersonDto[]>(key("people"), (people) =>
                people?.map((person) => (person.login === login ? { ...person, developerId: developer?.id ?? null, developerName: developer?.name ?? null, suggestion: null } : person)),
            )
            return previous
        },
        onError: (error, _variables, previous) => {
            if (previous) queryClient.setQueryData(key("people"), previous)
            toast.error(apiErrorMessage(error, "Não foi possível salvar a pessoa"))
        },
        onSuccess: (_person, { login, developer }) => toast.success(developer ? `@${login} → ${developer.name}` : `@${login} sem correspondência`),
    })
}

export function useSuggestPeople() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async () => unwrapApi((await api.post<ApiResponse<{ suggested: number; people: GithubPersonDto[] }>>("/integrations/github/people/suggestions")).data),
        onSuccess: ({ suggested, people }) => {
            queryClient.setQueryData(key("people"), people)
            if (suggested) toast.success(`${suggested} sugestão(ões) encontrada(s): confira e aceite`)
            else toast.info("Nenhuma sugestão encontrada pelo nome ou e-mail")
        },
        onError: onError("Não foi possível sugerir correspondências"),
    })
}

export function useAcceptSuggestions() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (logins: string[]) => unwrapApi((await api.put<ApiResponse<GithubPersonDto[]>>("/integrations/github/people/suggestions", { logins })).data),
        onSuccess: (people, logins) => {
            queryClient.setQueryData(key("people"), people)
            toast.success(`${logins.length} correspondência(s) aceita(s)`)
        },
        onError: onError("Não foi possível aceitar as sugestões"),
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
            invalidate("sync", "links", "people", "drafts")
            void queryClient.invalidateQueries({ queryKey: [TASKS_QUERY_KEY, "list"] })
        },
    })
}

export function useRestoreDraft() {
    const invalidate = useInvalidate()
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (draft: Pick<DiscardedDraftDto, "id" | "code">) => {
            await api.post(`/tasks/drafts/${draft.id}/restore`)
        },
        onSuccess: (_data, draft) => {
            toast.success(`${draft.code} voltou para o quadro`)
            invalidate("drafts", "links")
            void queryClient.invalidateQueries({ queryKey: [TASKS_QUERY_KEY, "list"] })
        },
        onError: onError("Não foi possível restaurar o rascunho"),
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
