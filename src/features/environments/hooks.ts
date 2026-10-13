"use client"

import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import type { AxiosInstance } from "axios"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import { appChannel } from "@/lib/pusher/channel-names"
import { environmentChannel } from "@/lib/pusher/channel-names"
import { clientChannel } from "@/lib/pusher/channel-names"
import { ENVIRONMENT_OPERATION_EVENT, ENVIRONMENTS_UPDATED_EVENT } from "./constants"
import type { OperationDto } from "./types"
import type { EnvironmentDto, EnvironmentProjectDto, EnvironmentRepoConfigDto } from "./types"
import type { EnvironmentInput, EnvironmentRepoUpdateInput } from "./types"
import type { EnvironmentImageDto } from "./types"
import type { ComposeSummary } from "./compose-types"
import type { CiCdRunDto, CiCdWorkflowDto } from "./server/ci-cd"
import type { EnvironmentLogLine } from "./types"

/**
 * Consultas e mutações do módulo Ambientes. O mesmo conjunto serve ao dono (axios central) e ao
 * portal do cliente (axios com `x-client-id`); muda só o `basePath` e o cliente HTTP. As chaves de
 * cache incluem o `basePath` para não misturar os dois contextos.
 */

export interface AmbientesApi {
    /** `/environments` (dono) ou `/cliente/ambientes` (portal). */
    basePath: string
    client: AxiosInstance
    /** Id do cliente em escopo (portal): assina o canal do cliente no tempo real. */
    clientId?: string
}

export const ownerAmbientesApi: AmbientesApi = { basePath: "/environments", client: api }

const keyRoot = (api: AmbientesApi) => ["environments", api.basePath] as const
const projectsKey = (api: AmbientesApi) => [...keyRoot(api), "projects"] as const
const repoConfigKey = (api: AmbientesApi, projectId: string) => [...keyRoot(api), "repo-config", projectId] as const
const listKey = (api: AmbientesApi, projectId: string) => [...keyRoot(api), "list", projectId] as const
const detailKey = (api: AmbientesApi, envId: string) => [...keyRoot(api), "detail", envId] as const
const composeKey = (api: AmbientesApi, envId: string) => [...keyRoot(api), "compose", envId] as const
const imagesKey = (api: AmbientesApi, envId: string) => [...keyRoot(api), "images", envId] as const
const operationsKey = (api: AmbientesApi, envId: string) => [...keyRoot(api), "operations", envId] as const
const ciCdKey = (api: AmbientesApi, projectId: string) => [...keyRoot(api), "ci-cd", projectId] as const

export function useEnvironmentProjects(context: AmbientesApi) {
    return useQuery({
        queryKey: projectsKey(context),
        queryFn: async () => unwrapApi((await context.client.get<ApiResponse<EnvironmentProjectDto[]>>(`${context.basePath}/projects`)).data),
        staleTime: 60_000,
    })
}

export function useRepoConfig(context: AmbientesApi, projectId: string) {
    return useQuery({
        queryKey: repoConfigKey(context, projectId),
        queryFn: async () => unwrapApi((await context.client.get<ApiResponse<EnvironmentRepoConfigDto>>(`${context.basePath}/projects/${projectId}`)).data),
        enabled: Boolean(projectId),
    })
}

export function useEnvironmentList(context: AmbientesApi, projectId: string) {
    return useQuery({
        queryKey: listKey(context, projectId),
        queryFn: async () => unwrapApi((await context.client.get<ApiResponse<EnvironmentDto[]>>(`${context.basePath}/projects/${projectId}/environments`)).data),
        enabled: Boolean(projectId),
        staleTime: 15_000,
    })
}

export function useEnvironmentDetail(context: AmbientesApi, envId: string) {
    return useQuery({
        queryKey: detailKey(context, envId),
        queryFn: async () => unwrapApi((await context.client.get<ApiResponse<EnvironmentDto>>(`${context.basePath}/environments/${envId}`)).data),
        enabled: Boolean(envId),
    })
}

export function useEnvironmentCompose(context: AmbientesApi, envId: string, enabled: boolean) {
    return useQuery({
        queryKey: composeKey(context, envId),
        queryFn: async () => unwrapApi((await context.client.get<ApiResponse<{ content: string; summary: ComposeSummary; conflicts: string[] }>>(`${context.basePath}/environments/${envId}/compose`)).data),
        enabled: Boolean(envId) && enabled,
        retry: false,
    })
}

export function useEnvironmentImages(context: AmbientesApi, envId: string, enabled: boolean) {
    return useQuery({
        queryKey: imagesKey(context, envId),
        queryFn: async () => unwrapApi((await context.client.get<ApiResponse<EnvironmentImageDto[]>>(`${context.basePath}/environments/${envId}/images`)).data),
        enabled: Boolean(envId) && enabled,
        retry: false,
    })
}

export function useEnvironmentOperations(context: AmbientesApi, envId: string, enabled: boolean) {
    return useQuery({
        queryKey: operationsKey(context, envId),
        queryFn: async () => unwrapApi((await context.client.get<ApiResponse<OperationDto[]>>(`${context.basePath}/environments/${envId}/operations`)).data),
        enabled: Boolean(envId) && enabled,
        refetchInterval: 15_000,
    })
}

export function useCiCd(context: AmbientesApi, projectId: string, params: { workflow?: string; branch?: string }, enabled: boolean) {
    return useQuery({
        queryKey: [...ciCdKey(context, projectId), params],
        queryFn: async () =>
            unwrapApi((await context.client.get<ApiResponse<{ runs: CiCdRunDto[]; workflows: CiCdWorkflowDto[] }>>(`${context.basePath}/projects/${projectId}/ci-cd`, { params })).data),
        enabled: Boolean(projectId) && enabled,
        retry: false,
        refetchInterval: 30_000,
    })
}

function invalidateEnv(queryClient: QueryClient, context: AmbientesApi, envId: string, projectId?: string) {
    void queryClient.invalidateQueries({ queryKey: detailKey(context, envId) })
    void queryClient.invalidateQueries({ queryKey: operationsKey(context, envId) })
    void queryClient.invalidateQueries({ queryKey: imagesKey(context, envId) })
    if (projectId) void queryClient.invalidateQueries({ queryKey: listKey(context, projectId) })
}

export function useUpdateRepoConfig(context: AmbientesApi, projectId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: EnvironmentRepoUpdateInput) =>
            unwrapApi((await context.client.put<ApiResponse<EnvironmentRepoConfigDto>>(`${context.basePath}/projects/${projectId}/config`, input)).data),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível salvar a configuração")),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: repoConfigKey(context, projectId) })
            toast.success("Configuração salva")
        },
    })
}

export function useCreateEnvironment(context: AmbientesApi, projectId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: EnvironmentInput) =>
            unwrapApi((await context.client.post<ApiResponse<EnvironmentDto>>(`${context.basePath}/projects/${projectId}/environments`, input)).data),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível criar o ambiente")),
        onSuccess: (env) => {
            void queryClient.invalidateQueries({ queryKey: listKey(context, projectId) })
            invalidateEnv(queryClient, context, env.id, projectId)
            toast.success("Ambiente criado")
        },
    })
}

export function useUpdateEnvironment(context: AmbientesApi, envId: string, projectId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: EnvironmentInput) =>
            unwrapApi((await context.client.patch<ApiResponse<EnvironmentDto>>(`${context.basePath}/environments/${envId}`, input)).data),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível salvar o ambiente")),
        onSuccess: () => {
            invalidateEnv(queryClient, context, envId, projectId)
            toast.success("Ambiente atualizado")
        },
    })
}

export function useDeleteEnvironment(context: AmbientesApi, projectId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (envId: string) => unwrapApi((await context.client.delete<ApiResponse<{ id: string }>>(`${context.basePath}/environments/${envId}`)).data),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível excluir o ambiente")),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: listKey(context, projectId) })
            toast.success("Ambiente excluído")
        },
    })
}

export function usePublish(context: AmbientesApi, envId: string, projectId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: { method: "local" | "cd"; branch?: string }) =>
            unwrapApi((await context.client.post<ApiResponse<OperationDto>>(`${context.basePath}/environments/${envId}/publish`, input)).data),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível iniciar a publicação")),
        onSuccess: (operation) => {
            invalidateEnv(queryClient, context, envId, projectId)
            toast.success(operation.queuePosition ? `Na fila do build · #${operation.queuePosition}` : "Publicação iniciada")
        },
    })
}

export function useRestore(context: AmbientesApi, envId: string, projectId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: { imageId: string; confirmUnverified?: boolean }) =>
            unwrapApi((await context.client.post<ApiResponse<OperationDto>>(`${context.basePath}/environments/${envId}/restore`, input)).data),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível restaurar")),
        onSuccess: () => {
            invalidateEnv(queryClient, context, envId, projectId)
            toast.success("Restauração iniciada")
        },
    })
}

/** Tempo real dos dados de ambiente: canal do app (dono) ou do cliente (portal). */
export function useAmbientesRealtime(context: AmbientesApi): void {
    const queryClient = useQueryClient()
    const channelName = context.clientId ? clientChannel(context.clientId) : appChannel()
    useEffect(() => {
        if (!isPusherClientAvailable()) return
        const channel = acquireChannel(channelName)
        const onChange = () => void queryClient.invalidateQueries({ queryKey: keyRoot(context) })
        channel.bind(ENVIRONMENTS_UPDATED_EVENT, onChange)
        return () => {
            channel.unbind(ENVIRONMENTS_UPDATED_EVENT, onChange)
            releaseChannel(channelName)
        }
    }, [channelName, context, queryClient])
}

/** Tempo real de uma operação: assina o canal do ambiente. */
export function useEnvironmentOperationRealtime(context: AmbientesApi, envId: string): void {
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!envId || !isPusherClientAvailable()) return
        const name = environmentChannel(envId)
        const channel = acquireChannel(name)
        const onChange = () => {
            void queryClient.invalidateQueries({ queryKey: detailKey(context, envId) })
            void queryClient.invalidateQueries({ queryKey: operationsKey(context, envId) })
            void queryClient.invalidateQueries({ queryKey: imagesKey(context, envId) })
        }
        channel.bind(ENVIRONMENT_OPERATION_EVENT, onChange)
        return () => {
            channel.unbind(ENVIRONMENT_OPERATION_EVENT, onChange)
            releaseChannel(name)
        }
    }, [context, envId, queryClient])
}

/** Logs do ambiente (histórico + tempo real) por polling e canal do ambiente. */
export function useEnvironmentLogs(
    context: AmbientesApi,
    envId: string,
    options: { enabled: boolean; service?: string | null; onLines: (lines: EnvironmentLogLine[], reset: boolean) => void },
): void {
    const { enabled, service, onLines } = options
    useEffect(() => {
        if (!enabled || !envId) return
        let cancelled = false
        let lastTs: string | undefined
        const seen = new Set<string>()
        const accept = (lines: EnvironmentLogLine[], reset: boolean) => {
            if (reset) {
                seen.clear()
                lastTs = undefined
            }
            const fresh = lines.filter((line) => {
                const key = `${line.ts}|${line.level}|${line.message}`
                if (seen.has(key)) return false
                seen.add(key)
                return true
            })
            for (const line of fresh) if (!lastTs || line.ts > lastTs) lastTs = line.ts
            if (fresh.length > 0 || reset) onLines(fresh, reset)
        }
        const refresh = async (reset: boolean) => {
            try {
                const params: Record<string, unknown> = {}
                if (reset || !lastTs) params.limit = 500
                else params.after = lastTs
                if (service) params.service = service
                const { data } = await context.client.get<ApiResponse<EnvironmentLogLine[]>>(`${context.basePath}/environments/${envId}/logs`, { params })
                if (!cancelled) accept(data.data ?? [], reset)
            } catch {
                // silencioso: o botão "Atualizar" da aba repete
            }
        }
        void refresh(true)
        const timer = setInterval(() => void refresh(false), 4_000)
        return () => {
            cancelled = true
            clearInterval(timer)
        }
    }, [context, enabled, envId, onLines, service])
}
