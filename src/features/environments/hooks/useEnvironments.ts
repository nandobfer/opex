"use client"

import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { appChannel } from "@/lib/pusher/channel-names"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import { ENVIRONMENTS_EVENT, ENVIRONMENTS_QUERY_KEY } from "../constants"
import type { AdoptInput, EnvironmentActionInput, EnvironmentInput, EnvironmentsSettings } from "../schemas"
import type { EnvironmentDeploySummaryDto, EnvironmentDto, EnvironmentsListDto, EnvironmentsSettingsDto, RegistryStatusDto } from "../types"

const base = "/environments"
export const environmentsKey = [ENVIRONMENTS_QUERY_KEY, "list"] as const
const settingsKey = [ENVIRONMENTS_QUERY_KEY, "settings"] as const
const registryKey = [ENVIRONMENTS_QUERY_KEY, "registry"] as const

/** Lista com o estado dos serviços (CPU/RAM atualizados a cada 10 s). */
export const useEnvironments = () =>
    useQuery({ queryKey: environmentsKey, queryFn: async () => unwrapApi((await api.get<ApiResponse<EnvironmentsListDto>>(base)).data), refetchInterval: 10_000 })

/** Histórico de deploys de um ambiente (os 30 últimos, sem o log); o tempo real invalida pelo prefixo. */
export const useEnvironmentDeploys = (id: string | null) =>
    useQuery({
        queryKey: [ENVIRONMENTS_QUERY_KEY, "deploys", id] as const,
        enabled: id !== null,
        queryFn: async () => unwrapApi((await api.get<ApiResponse<EnvironmentDeploySummaryDto[]>>(`${base}/${id}/deploys`)).data),
        refetchInterval: 10_000,
    })

export function useSaveEnvironment(id: string | null) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: EnvironmentInput) =>
            unwrapApi((id ? await api.put<ApiResponse<EnvironmentDto>>(`${base}/${id}`, input) : await api.post<ApiResponse<EnvironmentDto>>(base, input)).data),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: environmentsKey })
            toast.success(id ? "Ambiente salvo" : "Ambiente criado")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível salvar o ambiente")),
    })
}

export function useAdoptProject() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: AdoptInput) => unwrapApi((await api.post<ApiResponse<EnvironmentDto>>(`${base}/adopt`, input)).data),
        onSuccess: (env) => {
            void queryClient.invalidateQueries({ queryKey: environmentsKey })
            toast.success(`Projeto adotado como "${env.name}"`)
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível adotar o projeto")),
    })
}

const PENDING_STATE: Partial<Record<EnvironmentActionInput["action"], string>> = { up: "starting", down: "stopping", restart: "restarting" }

/**
 * Ações do ambiente. Levantar/derrubar/reiniciar são otimistas (os serviços mostram o estado
 * pretendido) e voltam ao anterior com toast na falha; deploy/mover devolvem o id do deploy.
 */
export function useEnvironmentAction(id: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: EnvironmentActionInput) => unwrapApi((await api.post<ApiResponse<{ deployId: string | null; output: string | null }>>(`${base}/${id}/actions`, input)).data),
        onMutate: async (input) => {
            const state = PENDING_STATE[input.action]
            if (!state) return { previous: undefined }
            await queryClient.cancelQueries({ queryKey: environmentsKey })
            const previous = queryClient.getQueryData<EnvironmentsListDto>(environmentsKey)
            if (previous)
                queryClient.setQueryData<EnvironmentsListDto>(environmentsKey, {
                    ...previous,
                    items: previous.items.map((env) => (env.id === id ? { ...env, services: env.services.map((service) => ({ ...service, state })) } : env)),
                })
            return { previous }
        },
        onError: (error, _input, context) => {
            if (context?.previous) queryClient.setQueryData(environmentsKey, context.previous)
            toast.error(apiErrorMessage(error, "Não foi possível executar a ação"))
        },
        onSettled: () => void queryClient.invalidateQueries({ queryKey: environmentsKey }),
    })
}

/** Apagar: some da lista na hora; volta (animado) se o servidor recusar. */
export function useDeleteEnvironment() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async ({ id, volumes }: { id: string; volumes: boolean }) => unwrapApi((await api.delete<ApiResponse<{ id: string }>>(`${base}/${id}${volumes ? "?volumes=1" : ""}`)).data),
        onMutate: async ({ id }) => {
            await queryClient.cancelQueries({ queryKey: environmentsKey })
            const previous = queryClient.getQueryData<EnvironmentsListDto>(environmentsKey)
            if (previous) queryClient.setQueryData<EnvironmentsListDto>(environmentsKey, { ...previous, items: previous.items.filter((env) => env.id !== id) })
            return { previous }
        },
        onSuccess: () => toast.success("Ambiente apagado"),
        onError: (error, _input, context) => {
            if (context?.previous) queryClient.setQueryData(environmentsKey, context.previous)
            toast.error(apiErrorMessage(error, "Não foi possível apagar o ambiente"))
        },
        onSettled: () => void queryClient.invalidateQueries({ queryKey: environmentsKey }),
    })
}

export const useEnvironmentsSettings = (enabled: boolean) =>
    useQuery({ queryKey: settingsKey, enabled, queryFn: async () => unwrapApi((await api.get<ApiResponse<EnvironmentsSettingsDto>>(`${base}/settings`)).data) })

export function useSaveEnvironmentsSettings() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: EnvironmentsSettings) => unwrapApi((await api.put<ApiResponse<EnvironmentsSettingsDto>>(`${base}/settings`, input)).data),
        onSuccess: (saved) => {
            queryClient.setQueryData(settingsKey, saved)
            toast.success("Configurações dos ambientes salvas")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível salvar as configurações")),
    })
}

export const useRegistryStatus = (enabled: boolean) =>
    useQuery({ queryKey: registryKey, enabled, queryFn: async () => unwrapApi((await api.get<ApiResponse<RegistryStatusDto>>(`${base}/registry`)).data) })

/** Recarrega a lista quando o servidor avisa `{ id, change }` (e ao reconectar). */
export function useEnvironmentsRealtime(): void {
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!isPusherClientAvailable()) return
        const name = appChannel()
        const channel = acquireChannel(name)
        const handler = () => void queryClient.invalidateQueries({ queryKey: [ENVIRONMENTS_QUERY_KEY] })
        channel.bind(ENVIRONMENTS_EVENT, handler)
        return () => {
            channel.unbind(ENVIRONMENTS_EVENT, handler)
            releaseChannel(name)
        }
    }, [queryClient])
}
