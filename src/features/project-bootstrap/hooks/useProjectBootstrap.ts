"use client"

import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { appChannel } from "@/lib/pusher/channel-names"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import { withBasePath } from "@/lib/base-path"
import type { FormReplyInput, PermissionReplyInput } from "@/features/agentic/schemas"
import { useEventStream } from "@/features/agentic/hooks/useEventStream"
import type { TimelineState } from "@/features/agentic/timeline"
import { PROJECT_BOOTSTRAP_CATALOG_UPDATED_EVENT, PROJECT_BOOTSTRAP_FEATURE, PROJECT_BOOTSTRAP_UPDATED_EVENT, type ProjectBootstrapAction } from "../constants"
import type { ProjectBootstrapSettings, ProjectBootstrapStartInput, TechGroupInput, TechnologyInput } from "../schemas"
import type { DirectoryCheckDto, ProjectBootstrapDto, ProjectBootstrapPrefillDto, ProjectBootstrapSettingsDto, ProjectBootstrapSummaryDto, RepoCheckDto, RepoOwnersDto, TechCatalogDto } from "../types"

/** Consultas e mutações do bootstrap de projeto (OPE-215). */

export const PROJECT_BOOTSTRAP_QUERY_KEY = "project-bootstraps"
const bootstrapKey = (id: string) => [PROJECT_BOOTSTRAP_QUERY_KEY, "item", id] as const
const listKey = (active: boolean) => [PROJECT_BOOTSTRAP_QUERY_KEY, "list", active ? "active" : "all"] as const
export const TECH_CATALOG_QUERY_KEY = [PROJECT_BOOTSTRAP_QUERY_KEY, "catalog"] as const
const settingsKey = () => ["ai-feature", PROJECT_BOOTSTRAP_FEATURE] as const

const get = async <T,>(path: string, params?: Record<string, string>) => unwrapApi((await api.get<ApiResponse<T>>(path, params ? { params } : undefined)).data)

export const useProjectBootstraps = (active = false) => useQuery({ queryKey: listKey(active), queryFn: () => get<ProjectBootstrapSummaryDto[]>("/project-bootstraps", active ? { active: "1" } : undefined), staleTime: 10_000 })

export const useProjectBootstrap = (id: string) => useQuery({ queryKey: bootstrapKey(id), queryFn: () => get<ProjectBootstrapDto>(`/project-bootstraps/${id}`), staleTime: 5_000 })

export const useBootstrapPrefill = () => useQuery({ queryKey: [PROJECT_BOOTSTRAP_QUERY_KEY, "prefill"], queryFn: () => get<ProjectBootstrapPrefillDto>("/project-bootstraps/prefill"), staleTime: 10_000 })

export const useRepoOwners = () => useQuery({ queryKey: [PROJECT_BOOTSTRAP_QUERY_KEY, "owners"], queryFn: () => get<RepoOwnersDto>("/project-bootstraps/owners"), staleTime: 5 * 60_000, retry: false })

export const useRepoCheck = (owner: string | null, name: string | null, visibility?: "private" | "public") =>
    useQuery({
        queryKey: [PROJECT_BOOTSTRAP_QUERY_KEY, "check-repo", owner, name, visibility ?? null],
        queryFn: async ({ signal }) => unwrapApi((await api.get<ApiResponse<RepoCheckDto>>("/project-bootstraps/check-repo", { params: { owner, name, visibility }, signal })).data),
        enabled: Boolean(owner && name),
        staleTime: 15_000,
        retry: false,
    })

export const useDirectoryCheck = (path: string | null, repo: string | null) =>
    useQuery({
        queryKey: [PROJECT_BOOTSTRAP_QUERY_KEY, "check-directory", path, repo],
        queryFn: async ({ signal }) => unwrapApi((await api.get<ApiResponse<DirectoryCheckDto>>("/project-bootstraps/check-directory", { params: { path, repo }, signal })).data),
        enabled: Boolean(path && repo),
        staleTime: 15_000,
        retry: false,
    })

export const useTechCatalog = () => useQuery({ queryKey: TECH_CATALOG_QUERY_KEY, queryFn: () => get<TechCatalogDto>("/project-bootstraps/catalog"), staleTime: 60_000 })

export function useStartProjectBootstrap() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: ProjectBootstrapStartInput) => unwrapApi((await api.post<ApiResponse<ProjectBootstrapDto>>("/project-bootstraps", input)).data),
        onSuccess: (dto) => {
            queryClient.setQueryData(bootstrapKey(dto.id), dto)
            void queryClient.invalidateQueries({ queryKey: [PROJECT_BOOTSTRAP_QUERY_KEY, "list"] })
            toast.success(`Bootstrap de ${dto.repo} iniciado`)
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível iniciar o bootstrap")),
    })
}

function useSetBootstrap(id: string) {
    const queryClient = useQueryClient()
    return (dto: ProjectBootstrapDto) => {
        queryClient.setQueryData(bootstrapKey(id), dto)
        void queryClient.invalidateQueries({ queryKey: [PROJECT_BOOTSTRAP_QUERY_KEY, "list"] })
    }
}

const ACTION_ERRORS: Record<ProjectBootstrapAction, string> = { retry: "Não foi possível tentar novamente", cancel: "Não foi possível cancelar o bootstrap", reconnect: "Não foi possível reconectar ao agente" }

export function useProjectBootstrapAction(id: string) {
    const set = useSetBootstrap(id)
    return useMutation({
        mutationFn: async (action: ProjectBootstrapAction) => unwrapApi((await api.post<ApiResponse<ProjectBootstrapDto>>(`/project-bootstraps/${id}/actions/${action}`)).data),
        onSuccess: (dto, action) => {
            set(dto)
            if (action === "cancel") toast.success("Bootstrap cancelado")
        },
        onError: (error, action) => toast.error(apiErrorMessage(error, ACTION_ERRORS[action])),
    })
}

export function useSendBootstrapMessage(id: string) {
    const set = useSetBootstrap(id)
    return useMutation({
        mutationFn: async (text: string) => unwrapApi((await api.post<ApiResponse<ProjectBootstrapDto>>(`/project-bootstraps/${id}/messages`, { text })).data),
        onSuccess: set,
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível enviar a mensagem ao agente")),
    })
}

export function useReplyBootstrapForm(id: string) {
    const set = useSetBootstrap(id)
    return useMutation({
        mutationFn: async ({ formId, ...input }: FormReplyInput & { formId: string }) => unwrapApi((await api.post<ApiResponse<ProjectBootstrapDto>>(`/project-bootstraps/${id}/forms/${encodeURIComponent(formId)}`, input)).data),
        onSuccess: set,
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível enviar a resposta")),
    })
}

export function useReplyBootstrapPermission(id: string) {
    const set = useSetBootstrap(id)
    return useMutation({
        mutationFn: async ({ requestId, ...input }: PermissionReplyInput & { requestId: string }) =>
            unwrapApi((await api.post<ApiResponse<ProjectBootstrapDto>>(`/project-bootstraps/${id}/permissions/${encodeURIComponent(requestId)}`, input)).data),
        onSuccess: set,
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível responder ao pedido")),
    })
}

/** Conversa do agente ao vivo (NDJSON); reconecta sozinho quando a conexão cai. */
export function useProjectBootstrapStream(id: string | null): { timeline: TimelineState; connected: boolean } {
    return useEventStream(id, id ? withBasePath(`/api/project-bootstraps/${id}/events`) : null)
}

/** O estado mudou no servidor (outra aba, turnos, deploy): recarrega o bootstrap e as listas. */
export function useProjectBootstrapRealtime(): void {
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!isPusherClientAvailable()) return
        const name = appChannel()
        const channel = acquireChannel(name)
        const handler = (event: { id?: string }) => {
            if (event?.id) void queryClient.invalidateQueries({ queryKey: bootstrapKey(event.id) })
            void queryClient.invalidateQueries({ queryKey: [PROJECT_BOOTSTRAP_QUERY_KEY, "list"] })
        }
        const catalog = () => void queryClient.invalidateQueries({ queryKey: TECH_CATALOG_QUERY_KEY })
        channel.bind(PROJECT_BOOTSTRAP_UPDATED_EVENT, handler)
        channel.bind(PROJECT_BOOTSTRAP_CATALOG_UPDATED_EVENT, catalog)
        return () => {
            channel.unbind(PROJECT_BOOTSTRAP_UPDATED_EVENT, handler)
            channel.unbind(PROJECT_BOOTSTRAP_CATALOG_UPDATED_EVENT, catalog)
            releaseChannel(name)
        }
    }, [queryClient])
}

// ── Configuração e catálogo ───────────────────────────────────────────────────

export const useProjectBootstrapSettings = () => useQuery({ queryKey: settingsKey(), queryFn: () => get<ProjectBootstrapSettingsDto>(`/ai/features/${PROJECT_BOOTSTRAP_FEATURE}`) })

export function useSaveProjectBootstrapSettings() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: ProjectBootstrapSettings) => unwrapApi((await api.put<ApiResponse<ProjectBootstrapSettingsDto>>(`/ai/features/${PROJECT_BOOTSTRAP_FEATURE}`, input)).data),
        onSuccess: (saved) => {
            queryClient.setQueryData(settingsKey(), saved)
            void queryClient.invalidateQueries({ queryKey: [PROJECT_BOOTSTRAP_QUERY_KEY, "prefill"] })
            toast.success('Configuração do "Agente de Bootstrap" salva')
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível salvar a configuração")),
    })
}

function useCatalogMutation<I>(request: (input: I) => Promise<unknown>, success: string, failure: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: request,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: TECH_CATALOG_QUERY_KEY })
            toast.success(success)
        },
        onError: (error) => toast.error(apiErrorMessage(error, failure)),
    })
}

export const useSaveTechGroup = () =>
    useCatalogMutation(async ({ id, ...input }: TechGroupInput & { id: string | null }) => (id ? api.put(`/project-bootstraps/tech-groups/${id}`, input) : api.post("/project-bootstraps/tech-groups", input)), "Grupo salvo", "Não foi possível salvar o grupo")

export const useDeleteTechGroup = () => useCatalogMutation(async (id: string) => api.delete(`/project-bootstraps/tech-groups/${id}`), "Grupo removido", "Não foi possível remover o grupo")

export const useSaveTechnology = () =>
    useCatalogMutation(async ({ id, ...input }: TechnologyInput & { id: string | null }) => (id ? api.put(`/project-bootstraps/technologies/${id}`, input) : api.post("/project-bootstraps/technologies", input)), "Tecnologia salva", "Não foi possível salvar a tecnologia")

export const useDeleteTechnology = () => useCatalogMutation(async (id: string) => api.delete(`/project-bootstraps/technologies/${id}`), "Tecnologia removida", "Não foi possível remover a tecnologia")
