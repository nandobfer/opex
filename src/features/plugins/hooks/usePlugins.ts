"use client"

import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { apiErrorMessage, unwrapApi } from "@/lib/api"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import type { ApiResponse } from "@/lib/types/api"
import { PLUGIN_UPDATED_EVENT, type PluginScope } from "../constants"
import { usePluginSource } from "../client/PluginSourceContext"
import type { PluginRuntimeSnapshot } from "../server/kernel/kernel"
import type { PluginDetailDto, PluginDiffDto, PluginDto, PluginRuntimeManifestDto, PluginUpdatedPayload, PluginVersionDetailDto } from "../types"

/** Hooks de dados dos plugins (OPE-172), para o dono e para o portal (pela fonte do contexto). */

export const pluginKeys = {
    all: ["plugins"] as const,
    list: (source: string, filter: object) => ["plugins", source, "list", filter] as const,
    detail: (source: string, id: string) => ["plugins", source, "detail", id] as const,
    version: (source: string, id: string, versionId: string) => ["plugins", source, "version", id, versionId] as const,
    diff: (source: string, id: string, to: string, from: string | null) => ["plugins", source, "diff", id, to, from] as const,
    runtime: (source: string) => ["plugins", source, "runtime"] as const,
    kernel: ["plugins", "owner", "kernel"] as const,
}

const sourceKey = (source: { kind: string; clientId: string | null }) => (source.kind === "client" ? `client:${source.clientId}` : "owner")

export function usePlugins(filter: { scope?: PluginScope; clientId?: string } = {}) {
    const source = usePluginSource()
    return useQuery({
        queryKey: pluginKeys.list(sourceKey(source), filter),
        queryFn: async () => unwrapApi((await source.api.get<ApiResponse<PluginDto[]>>(source.base, { params: filter })).data),
    })
}

export function usePlugin(id: string | null) {
    const source = usePluginSource()
    return useQuery({
        queryKey: pluginKeys.detail(sourceKey(source), id ?? ""),
        enabled: Boolean(id),
        queryFn: async () => unwrapApi((await source.api.get<ApiResponse<PluginDetailDto>>(`${source.base}/${id}`)).data),
    })
}

export function usePluginVersion(id: string, versionId: string | null) {
    const source = usePluginSource()
    return useQuery({
        queryKey: pluginKeys.version(sourceKey(source), id, versionId ?? ""),
        enabled: Boolean(versionId) && source.kind === "owner",
        queryFn: async () => unwrapApi((await source.api.get<ApiResponse<PluginVersionDetailDto>>(`${source.base}/${id}/versions/${versionId}`)).data),
    })
}

export function usePluginDiff(id: string, to: string | null, from: string | null) {
    const source = usePluginSource()
    return useQuery({
        queryKey: pluginKeys.diff(sourceKey(source), id, to ?? "", from),
        enabled: Boolean(to),
        queryFn: async () => unwrapApi((await source.api.get<ApiResponse<PluginDiffDto>>(`${source.base}/${id}/diff`, { params: { to, ...(from ? { from } : {}) } })).data),
    })
}

/** O que o navegador monta agora (stable, ou preview com a prévia ligada). */
export function usePluginRuntime(enabled = true) {
    const source = usePluginSource()
    return useQuery({
        queryKey: pluginKeys.runtime(sourceKey(source)),
        enabled,
        staleTime: 30_000,
        queryFn: async () => unwrapApi((await source.api.get<ApiResponse<PluginRuntimeManifestDto>>(`${source.base}/runtime`)).data),
    })
}

/** Fotografia do kernel (só o dono). */
export function usePluginKernel(enabled = true) {
    const source = usePluginSource()
    return useQuery({
        queryKey: pluginKeys.kernel,
        enabled: enabled && source.kind === "owner",
        queryFn: async () => unwrapApi((await source.api.get<ApiResponse<PluginRuntimeSnapshot>>("/plugins/kernel")).data),
    })
}

function useInvalidatePlugins() {
    const queryClient = useQueryClient()
    return () => queryClient.invalidateQueries({ queryKey: pluginKeys.all })
}

export function useRollbackPlugin(id: string) {
    const source = usePluginSource()
    const invalidate = useInvalidatePlugins()
    return useMutation({
        mutationFn: async (versionId: string) => unwrapApi((await source.api.post<ApiResponse<{ number: number }>>(`${source.base}/${id}/rollback`, { versionId })).data),
        onSuccess: (data) => {
            toast.success(`Plugin voltou para a versão ${data.number}`)
            void invalidate()
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível fazer o rollback")),
    })
}

export function useSetPluginActive(id: string) {
    const source = usePluginSource()
    const invalidate = useInvalidatePlugins()
    return useMutation({
        mutationFn: async (active: boolean) => unwrapApi((await source.api.patch<ApiResponse<{ active: boolean }>>(`${source.base}/${id}/active`, { active })).data),
        onSuccess: (data) => {
            toast.success(data.active ? "Plugin ativado" : "Plugin desativado")
            void invalidate()
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível alterar o plugin")),
    })
}

/** Liga/desliga a prévia do plugin neste navegador (cookie): a tela troca de versão ao vivo. */
export function useTogglePluginPreview(id: string) {
    const source = usePluginSource()
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (on: boolean) => unwrapApi((await source.api.post<ApiResponse<{ previewOn: string[] }>>(`${source.base}/${id}/preview`, { on })).data),
        onSuccess: (_data, on) => {
            toast.success(on ? "Prévia ligada neste navegador" : "Prévia desligada: você vê a versão estável")
            void queryClient.invalidateQueries({ queryKey: pluginKeys.runtime(sourceKey(source)) })
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível alterar a prévia")),
    })
}

/** Portal: o admin do cliente aprova a versão em prévia (segue para os testes e a consolidação). */
export function useApprovePluginPreview(id: string) {
    const source = usePluginSource()
    const invalidate = useInvalidatePlugins()
    return useMutation({
        mutationFn: async () => unwrapApi((await source.api.post<ApiResponse<{ ok: true }>>(`${source.base}/${id}/approve`, {})).data),
        onSuccess: () => {
            toast.success("Prévia aprovada: os testes do plugin rodam antes da consolidação")
            void invalidate()
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível aprovar a prévia")),
    })
}

/**
 * Tempo real: `plugin-updated` (`{ id, version, channel }`) no canal da fonte invalida lista, detalhe
 * e o manifesto de runtime — os slots abertos trocam de versão sem recarregar a página.
 */
export function usePluginsRealtime(enabled = true): void {
    const source = usePluginSource()
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!enabled || !isPusherClientAvailable()) return
        const name = source.channel
        const channel = acquireChannel(name)
        const onUpdated = (payload: PluginUpdatedPayload) => {
            void queryClient.invalidateQueries({ queryKey: pluginKeys.all })
            void payload
        }
        channel.bind(PLUGIN_UPDATED_EVENT, onUpdated)
        return () => {
            channel.unbind(PLUGIN_UPDATED_EVENT, onUpdated)
            releaseChannel(name)
        }
    }, [enabled, queryClient, source.channel])
}
