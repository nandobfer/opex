"use client"

import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { appChannel } from "@/lib/pusher/channel-names"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import { useIntegration } from "@/features/integrations/hooks/useIntegrations"
import { LOCAL_DOCKER_QUERY_KEY, LOCAL_DOCKER_UPDATED_EVENT } from "../constants"
import type { ManualStep } from "../commands"
import type { LocalDockerContainerAction, LocalDockerKeyAction, LocalDockerMachineAction, LocalDockerOverrideMode, LocalDockerSettings } from "../schemas"
import type { LocalDockerContainerDto, LocalDockerContainersDto, LocalDockerMachineResultDto, LocalDockerOverrideDto, LocalDockerSettingsDto, LocalDockerStatusDto } from "../types"

/** A integração Builder Machine está ativa (campo "Integração ativa", como salvo)? */
export const useBuilderMachineActive = (): boolean => useIntegration("builder_machine").data?.publicValues.active === true

export const localDockerSettingsKey = [LOCAL_DOCKER_QUERY_KEY, "settings"] as const
export const localDockerStatusKey = [LOCAL_DOCKER_QUERY_KEY, "status"] as const
export const localDockerContainersKey = [LOCAL_DOCKER_QUERY_KEY, "containers"] as const
export const localDockerOverrideKey = (centralId: string) => [LOCAL_DOCKER_QUERY_KEY, "override", centralId] as const

/** `enabled` = integração ativa (desativada, as rotas respondem 404). */
export const useLocalDockerSettings = (enabled = true) =>
    useQuery({
        queryKey: localDockerSettingsKey,
        queryFn: async () => unwrapApi((await api.get<ApiResponse<LocalDockerSettingsDto>>("/local-docker/settings")).data),
        enabled,
    })

/** Situação do PC e do túnel (confere na hora; o Pusher avisa quando muda). */
export const useLocalDockerStatus = () =>
    useQuery({
        queryKey: localDockerStatusKey,
        queryFn: async () => unwrapApi((await api.get<ApiResponse<LocalDockerStatusDto>>("/local-docker/status")).data),
        staleTime: 15_000,
    })

export function useSaveLocalDockerSettings() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: LocalDockerSettings) => unwrapApi((await api.put<ApiResponse<LocalDockerSettingsDto>>("/local-docker/settings", input)).data),
        onSuccess: (saved) => {
            queryClient.setQueryData(localDockerSettingsKey, saved)
            void queryClient.invalidateQueries({ queryKey: localDockerStatusKey })
            toast.success("Configuração da Builder Machine salva")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível salvar a configuração")),
    })
}

/** Gerar uma chave nova ou inserir uma existente (a resposta nunca traz a chave). */
export function useLocalDockerKey() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: LocalDockerKeyAction) => unwrapApi((await api.post<ApiResponse<LocalDockerSettingsDto>>("/local-docker/key", input)).data),
        onSuccess: (saved, input) => {
            queryClient.setQueryData(localDockerSettingsKey, saved)
            toast.success(input.action === "import" ? "Chave inserida: rode o script de novo no WSL para autorizá-la" : "Chave nova gerada: rode o script de novo no WSL para autorizá-la")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível trocar a chave")),
    })
}

/** Passo a passo manual do preparo (só busca quando a seção está aberta). */
export const useLocalDockerManual = (mirrored: boolean, enabled: boolean) =>
    useQuery({
        queryKey: [LOCAL_DOCKER_QUERY_KEY, "manual", mirrored],
        queryFn: async () => unwrapApi((await api.get<ApiResponse<{ steps: ManualStep[] }>>(`/local-docker/manual?mirrored=${mirrored ? "1" : "0"}`)).data).steps,
        enabled,
    })

export function useLocalDockerBootstrap() {
    return useMutation({
        mutationFn: async (mirrored: boolean) => unwrapApi((await api.get<ApiResponse<{ script: string }>>(`/local-docker/bootstrap?mirrored=${mirrored ? "1" : "0"}`)).data).script,
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível gerar o script")),
    })
}

/** Abrir/fechar o túnel: a situação muda na hora (otimista) e volta se o servidor recusar. */
export function useLocalDockerTunnel() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: { action: "open" | "close"; confirm?: boolean }) => unwrapApi((await api.post<ApiResponse<LocalDockerStatusDto>>("/local-docker/tunnel", input)).data),
        onMutate: async (input) => {
            await queryClient.cancelQueries({ queryKey: localDockerStatusKey })
            const previous = queryClient.getQueryData<LocalDockerStatusDto>(localDockerStatusKey)
            if (previous) queryClient.setQueryData<LocalDockerStatusDto>(localDockerStatusKey, { ...previous, tunnelOpen: input.action === "open", wantOpen: input.action === "open", routesToLocal: input.action === "open" && previous.routesToLocal })
            return { previous }
        },
        onSuccess: (status, input) => {
            queryClient.setQueryData(localDockerStatusKey, status)
            toast.success(input.action === "open" ? "Túnel aberto: as próximas prévias vão para o PC" : "Túnel fechado: as próximas prévias vão para o servidor")
        },
        onError: (error, _input, context) => {
            if (context?.previous) queryClient.setQueryData(localDockerStatusKey, context.previous)
            toast.error(apiErrorMessage(error, "Não foi possível mudar o túnel"))
        },
    })
}

const MACHINE_LABELS: Record<LocalDockerMachineAction, string> = { test: "Teste da conexão", prepare: "Preparo do Docker do PC" }

export function useLocalDockerMachine() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (action: LocalDockerMachineAction) => unwrapApi((await api.post<ApiResponse<LocalDockerMachineResultDto>>("/local-docker/machine", { action })).data),
        onSuccess: (result) => {
            void queryClient.invalidateQueries({ queryKey: localDockerStatusKey })
            void queryClient.invalidateQueries({ queryKey: localDockerSettingsKey })
            void queryClient.invalidateQueries({ queryKey: localDockerContainersKey })
            if (result.ok) toast.success(`${MACHINE_LABELS[result.action]}: concluído`)
            else toast.error(`${MACHINE_LABELS[result.action]}: falhou — veja os passos`)
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível executar a ação no PC")),
    })
}

/** Containers do PC; com `live`, CPU e memória se atualizam a cada 10 s (só com a guia visível). */
export const useLocalDockerContainers = (live: boolean) =>
    useQuery({
        queryKey: localDockerContainersKey,
        queryFn: async () => unwrapApi((await api.get<ApiResponse<LocalDockerContainersDto>>("/local-docker/containers")).data),
        refetchInterval: live ? 10_000 : false,
        staleTime: 5_000,
    })

const CONTAINER_LABELS: Record<LocalDockerContainerAction, string> = { start: "levantado", stop: "derrubado", recreate: "recriado", delete: "apagado com o ambiente" }

/** Levantar/derrubar mudam o estado na hora (otimista) e voltam se o servidor recusar. */
export function useLocalDockerContainerAction() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: { name: string; action: LocalDockerContainerAction; confirm?: boolean }) =>
            unwrapApi((await api.post<ApiResponse<LocalDockerContainersDto>>(`/local-docker/containers/${encodeURIComponent(input.name)}`, { action: input.action, confirm: input.confirm })).data),
        onMutate: async (input) => {
            await queryClient.cancelQueries({ queryKey: localDockerContainersKey })
            const previous = queryClient.getQueryData<LocalDockerContainersDto>(localDockerContainersKey)
            if (previous && (input.action === "start" || input.action === "stop")) {
                const patch = (item: LocalDockerContainerDto) => (item.name === input.name ? { ...item, state: input.action === "start" ? "running" : "exited", stats: input.action === "stop" ? null : item.stats } : item)
                queryClient.setQueryData<LocalDockerContainersDto>(localDockerContainersKey, { ...previous, previews: previous.previews.map(patch), environment: previous.environment.map(patch) })
            }
            return { previous }
        },
        onSuccess: (data, input) => {
            queryClient.setQueryData(localDockerContainersKey, data)
            void queryClient.invalidateQueries({ queryKey: localDockerStatusKey })
            toast.success(`${input.name}: ${CONTAINER_LABELS[input.action]}`)
        },
        onError: (error, _input, context) => {
            if (context?.previous) queryClient.setQueryData(localDockerContainersKey, context.previous)
            toast.error(apiErrorMessage(error, "Não foi possível executar a ação no container"))
        },
    })
}

export const useLocalDockerOverride = (centralId: string, enabled = true) =>
    useQuery({
        enabled,
        queryKey: localDockerOverrideKey(centralId),
        queryFn: async () => unwrapApi((await api.get<ApiResponse<LocalDockerOverrideDto>>(`/local-docker/centrals/${centralId}`)).data),
    })

/** Sobrescrita da central: otimista, com reversão e toast na falha. */
export function useSetLocalDockerOverride(centralId: string) {
    const queryClient = useQueryClient()
    const key = localDockerOverrideKey(centralId)
    return useMutation({
        mutationFn: async (mode: LocalDockerOverrideMode) => unwrapApi((await api.put<ApiResponse<LocalDockerOverrideDto>>(`/local-docker/centrals/${centralId}`, { mode })).data),
        onMutate: async (mode) => {
            await queryClient.cancelQueries({ queryKey: key })
            const previous = queryClient.getQueryData<LocalDockerOverrideDto>(key)
            queryClient.setQueryData<LocalDockerOverrideDto>(key, { centralId, mode })
            return { previous }
        },
        onSuccess: (saved) => queryClient.setQueryData(key, saved),
        onError: (error, _mode, context) => {
            if (context?.previous) queryClient.setQueryData(key, context.previous)
            toast.error(apiErrorMessage(error, "Não foi possível salvar a máquina da central"))
        },
    })
}

/** Recarrega as consultas da Builder Machine quando o servidor avisa (e ao reconectar). */
export function useLocalDockerRealtime(): void {
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!isPusherClientAvailable()) return
        const name = appChannel()
        const channel = acquireChannel(name)
        const handler = () => void queryClient.invalidateQueries({ queryKey: [LOCAL_DOCKER_QUERY_KEY] })
        channel.bind(LOCAL_DOCKER_UPDATED_EVENT, handler)
        return () => {
            channel.unbind(LOCAL_DOCKER_UPDATED_EVENT, handler)
            releaseChannel(name)
        }
    }, [queryClient])
}
