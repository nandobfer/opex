"use client"

import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { appChannel } from "@/lib/pusher/channel-names"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import { OPENCODE_BACKUPS_UPDATED_EVENT, OPENCODE_RESOURCE_KIND_LABELS, OPENCODE_RESOURCES_UPDATED_EVENT, type OpencodeResourceKind } from "../constants"
import type { McpSecretsInput, ResourceContentInput, ResourceCreateInput, ResourceInstallInput } from "../schemas"
import type { McpTestResultDto, OpencodeBackupDto, OpencodeResourceDetailDto, OpencodeResourceDto, OpencodeScopeDto, ResourceMutationResultDto, ResourceUpdateManyResultDto } from "../types"

/** Consultas e mutações dos recursos do OpenCode (abas Skills, Agentes, Comandos, Plugins e MCPs). */

const BASE = "/ai/providers/opencode"
const seg = encodeURIComponent

export const OPENCODE_RESOURCES_KEY = ["ai", "opencode-resources"] as const
export const resourcesKey = (kind: OpencodeResourceKind, scope: string) => [...OPENCODE_RESOURCES_KEY, "list", kind, scope] as const
const detailKey = (id: string) => [...OPENCODE_RESOURCES_KEY, "detail", id] as const
const SCOPES_KEY = [...OPENCODE_RESOURCES_KEY, "scopes"] as const
export const OPENCODE_BACKUPS_KEY = ["ai", "opencode-backups"] as const

export const useOpencodeScopes = () =>
    useQuery({ queryKey: SCOPES_KEY, queryFn: async () => unwrapApi((await api.get<ApiResponse<OpencodeScopeDto[]>>(`${BASE}/scopes`)).data), staleTime: 60_000 })

export const useOpencodeResources = (kind: OpencodeResourceKind, scope: string, enabled = true) =>
    useQuery({
        queryKey: resourcesKey(kind, scope),
        queryFn: async () => unwrapApi((await api.get<ApiResponse<OpencodeResourceDto[]>>(`${BASE}/resources/${kind}`, { params: { scope } })).data),
        enabled,
        staleTime: 30_000,
        retry: false,
    })

/** Recarrega a lista consultando as versões disponíveis sem cache. */
export async function refreshOpencodeResources(kind: OpencodeResourceKind, scope: string): Promise<OpencodeResourceDto[]> {
    return unwrapApi((await api.get<ApiResponse<OpencodeResourceDto[]>>(`${BASE}/resources/${kind}`, { params: { scope, refresh: "1" } })).data)
}

export const useOpencodeResource = (kind: OpencodeResourceKind, id: string | null) =>
    useQuery({
        queryKey: detailKey(id ?? ""),
        queryFn: async () => unwrapApi((await api.get<ApiResponse<OpencodeResourceDetailDto>>(`${BASE}/resources/${kind}/${seg(id ?? "")}`)).data),
        enabled: Boolean(id),
        staleTime: 0,
        retry: false,
    })

function useInvalidate(kind: OpencodeResourceKind) {
    const queryClient = useQueryClient()
    return () => {
        void queryClient.invalidateQueries({ queryKey: [...OPENCODE_RESOURCES_KEY, "list", kind] })
        void queryClient.invalidateQueries({ queryKey: [...OPENCODE_RESOURCES_KEY, "detail"] })
        void queryClient.invalidateQueries({ queryKey: OPENCODE_BACKUPS_KEY })
    }
}

const restartHint = (result: { restartRequired: boolean }) => (result.restartRequired ? " — reinicie o serviço (aba Controles) para aplicar" : "")

export function useCreateOpencodeResource(kind: OpencodeResourceKind) {
    const invalidate = useInvalidate(kind)
    return useMutation({
        mutationFn: async (input: ResourceCreateInput) => unwrapApi((await api.post<ApiResponse<ResourceMutationResultDto>>(`${BASE}/resources/${kind}`, input)).data),
        onSuccess: (result) => toast.success(`${capital(OPENCODE_RESOURCE_KIND_LABELS[kind].one)} criad${OPENCODE_RESOURCE_KIND_LABELS[kind].article}${restartHint(result)}`),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível criar")),
        onSettled: invalidate,
    })
}

export function useUpdateOpencodeResource(kind: OpencodeResourceKind) {
    const invalidate = useInvalidate(kind)
    return useMutation({
        mutationFn: async ({ id, content }: { id: string; content: ResourceContentInput }) => unwrapApi((await api.patch<ApiResponse<ResourceMutationResultDto>>(`${BASE}/resources/${kind}/${seg(id)}`, content)).data),
        onSuccess: (result) => toast.success(`Alterações salvas${restartHint(result)}`),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível salvar")),
        onSettled: invalidate,
    })
}

export function useDeleteOpencodeResource(kind: OpencodeResourceKind) {
    const invalidate = useInvalidate(kind)
    return useMutation({
        mutationFn: async (id: string) => unwrapApi((await api.delete<ApiResponse<ResourceMutationResultDto>>(`${BASE}/resources/${kind}/${seg(id)}`)).data),
        onSuccess: (result) => toast.success(`${capital(OPENCODE_RESOURCE_KIND_LABELS[kind].one)} removid${OPENCODE_RESOURCE_KIND_LABELS[kind].article}${restartHint(result)}`),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível remover")),
        onSettled: invalidate,
    })
}

/** Liga/desliga com resposta otimista (reversão + toast na falha). */
export function useToggleOpencodeResource(kind: OpencodeResourceKind, scope: string) {
    const queryClient = useQueryClient()
    const invalidate = useInvalidate(kind)
    const key = resourcesKey(kind, scope)
    return useMutation({
        mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => unwrapApi((await api.post<ApiResponse<ResourceMutationResultDto>>(`${BASE}/resources/${kind}/${seg(id)}/toggle`, { enabled })).data),
        onMutate: async ({ id, enabled }) => {
            await queryClient.cancelQueries({ queryKey: key })
            const previous = queryClient.getQueryData<OpencodeResourceDto[]>(key)
            if (previous) queryClient.setQueryData(key, withEnabled(previous, id, enabled))
            return { previous }
        },
        onError: (error, _input, context) => {
            if (context?.previous) queryClient.setQueryData(key, context.previous)
            toast.error(apiErrorMessage(error, "Não foi possível alterar"))
        },
        onSuccess: (result, input) => toast.success(`${input.enabled ? "Ligado" : "Desligado"}${restartHint(result)}`),
        onSettled: invalidate,
    })
}

export function withEnabled(items: readonly OpencodeResourceDto[], id: string, enabled: boolean): OpencodeResourceDto[] {
    return items.map((item) => (item.id === id ? { ...item, enabled } : item))
}

export function useInstallOpencodeResource(kind: OpencodeResourceKind) {
    const invalidate = useInvalidate(kind)
    return useMutation({
        mutationFn: async (input: ResourceInstallInput) => unwrapApi((await api.post<ApiResponse<ResourceMutationResultDto & { names: string[] }>>(`${BASE}/resources/${kind}/install`, input, { timeout: 0 })).data),
        onSuccess: (result) => toast.success(`Instalado${result.names.length ? `: ${result.names.join(", ")}` : ""}${restartHint(result)}`),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível instalar")),
        onSettled: invalidate,
    })
}

export function useUpdateOpencodeResources(kind: OpencodeResourceKind, scope: string) {
    const invalidate = useInvalidate(kind)
    return useMutation({
        mutationFn: async (input: { ids?: string[]; all?: boolean }) => unwrapApi((await api.post<ApiResponse<ResourceUpdateManyResultDto>>(`${BASE}/resources/${kind}/update`, input, { params: { scope }, timeout: 0 })).data),
        onSuccess: (result) => toast.success(result.updated.length ? `Atualizado: ${result.updated.map((item) => item.name).join(", ")}${restartHint(result)}` : "Nada para atualizar"),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível atualizar")),
        onSettled: invalidate,
    })
}

export function useSetMcpSecrets() {
    const invalidate = useInvalidate("mcp")
    return useMutation({
        mutationFn: async ({ id, secrets }: { id: string; secrets: McpSecretsInput }) => unwrapApi((await api.put<ApiResponse<ResourceMutationResultDto>>(`${BASE}/resources/mcp/${seg(id)}/secrets`, secrets)).data),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível gravar os segredos")),
        onSettled: invalidate,
    })
}

export function useTestMcp() {
    return useMutation({
        mutationFn: async (id: string) => unwrapApi((await api.post<ApiResponse<McpTestResultDto>>(`${BASE}/resources/mcp/${seg(id)}/test`, undefined, { timeout: 0 })).data),
    })
}

export const useOpencodeBackups = (enabled = true) =>
    useQuery({ queryKey: OPENCODE_BACKUPS_KEY, queryFn: async () => unwrapApi((await api.get<ApiResponse<OpencodeBackupDto[]>>(`${BASE}/backups`)).data), enabled, staleTime: 30_000, retry: false })

export function useRestoreOpencodeBackup() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (id: string) => unwrapApi((await api.post<ApiResponse<{ restored: OpencodeBackupDto; safetyBackupId: string }>>(`${BASE}/backups/${seg(id)}/restore`)).data),
        onSuccess: () => toast.success("Backup restaurado (o estado anterior também foi guardado)"),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível restaurar o backup")),
        onSettled: () => {
            void queryClient.invalidateQueries({ queryKey: OPENCODE_RESOURCES_KEY })
            void queryClient.invalidateQueries({ queryKey: OPENCODE_BACKUPS_KEY })
        },
    })
}

/** Mudanças feitas por outra aba, pelo Agente Opex ou por uma restauração chegam pelo Pusher. */
export function useOpencodeResourcesRealtime(): void {
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!isPusherClientAvailable()) return
        const name = appChannel()
        const channel = acquireChannel(name)
        const onResources = (payload: { kind?: string } | undefined) => {
            const kind = payload?.kind
            void queryClient.invalidateQueries({ queryKey: kind && kind !== "all" ? [...OPENCODE_RESOURCES_KEY, "list", kind] : OPENCODE_RESOURCES_KEY })
        }
        const onBackups = () => void queryClient.invalidateQueries({ queryKey: OPENCODE_BACKUPS_KEY })
        channel.bind(OPENCODE_RESOURCES_UPDATED_EVENT, onResources)
        channel.bind(OPENCODE_BACKUPS_UPDATED_EVENT, onBackups)
        return () => {
            channel.unbind(OPENCODE_RESOURCES_UPDATED_EVENT, onResources)
            channel.unbind(OPENCODE_BACKUPS_UPDATED_EVENT, onBackups)
            releaseChannel(name)
        }
    }, [queryClient])
}

const capital = (text: string) => (text ? text[0]!.toUpperCase() + text.slice(1) : text)
