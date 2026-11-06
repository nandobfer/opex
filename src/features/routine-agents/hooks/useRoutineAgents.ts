"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import type { RoutineAgentInput, RoutineAgentSettingsInput, RoutineListFilter } from "../schemas"
import type { RoutineAgentDto, RoutineOpencodeOptionsDto } from "../types"
import { routineKeys } from "./keys"

/** Cadastro dos agentes rotineiros no cliente (OPE-130). */

export function useRoutineAgents(filter: RoutineListFilter = "current") {
    return useQuery({
        queryKey: routineKeys.list(filter),
        queryFn: async () => unwrapApi((await api.get<ApiResponse<RoutineAgentDto[]>>("/routine-agents", { params: filter === "archived" ? { filtro: "arquivados" } : {} })).data),
    })
}

export function useRoutineAgent(id: string | null) {
    return useQuery({
        queryKey: routineKeys.agent(id ?? ""),
        queryFn: async () => unwrapApi((await api.get<ApiResponse<RoutineAgentDto>>(`/routine-agents/${id}`)).data),
        enabled: Boolean(id),
    })
}

export function useSaveRoutineAgent() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async ({ id, input }: { id: string | null; input: RoutineAgentInput }) =>
            unwrapApi((id ? await api.patch<ApiResponse<RoutineAgentDto>>(`/routine-agents/${id}`, input) : await api.post<ApiResponse<RoutineAgentDto>>("/routine-agents", input)).data),
        onSuccess: (agent, { id }) => {
            toast.success(id ? "Agente rotineiro salvo" : "Agente rotineiro criado: o provisionamento começou")
            queryClient.setQueryData(routineKeys.agent(agent.id), agent)
            void queryClient.invalidateQueries({ queryKey: routineKeys.all })
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível salvar o agente rotineiro")),
    })
}

export type RoutineStatusAction = "pause" | "resume" | "archive" | "unarchive"
const STATUS_TOAST: Record<RoutineStatusAction, string> = { pause: "Agente pausado", resume: "Agente retomado", archive: "Agente arquivado", unarchive: "Agente desarquivado (pausado)" }

export function useRoutineAgentStatus() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async ({ id, action }: { id: string; action: RoutineStatusAction }) => unwrapApi((await api.post<ApiResponse<RoutineAgentDto>>(`/routine-agents/${id}/status`, { action })).data),
        onSuccess: (agent, { action }) => {
            toast.success(STATUS_TOAST[action])
            queryClient.setQueryData(routineKeys.agent(agent.id), agent)
            void queryClient.invalidateQueries({ queryKey: routineKeys.all })
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível alterar o status do agente")),
    })
}

export function useRoutineProvisioning() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async ({ id, mode }: { id: string; mode: "reprovision" | "retry" }) => unwrapApi((await api.post<ApiResponse<RoutineAgentDto>>(`/routine-agents/${id}/provisioning`, { mode })).data),
        onSuccess: (agent, { mode }) => {
            toast.success(mode === "retry" ? "Provisionamento retomado" : "Reprovisionamento iniciado")
            queryClient.setQueryData(routineKeys.agent(agent.id), agent)
            void queryClient.invalidateQueries({ queryKey: routineKeys.all })
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível provisionar o agente")),
    })
}

export function useRoutineAgentSettings() {
    return useQuery({ queryKey: routineKeys.settings, queryFn: async () => unwrapApi((await api.get<ApiResponse<RoutineAgentSettingsInput>>("/routine-agents/settings")).data) })
}

export function useSaveRoutineAgentSettings() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: RoutineAgentSettingsInput) => unwrapApi((await api.put<ApiResponse<RoutineAgentSettingsInput>>("/routine-agents/settings", input)).data),
        onSuccess: (data) => {
            toast.success("Modelo do provisionamento salvo")
            queryClient.setQueryData(routineKeys.settings, data)
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível salvar o modelo do provisionamento")),
    })
}

export function useRoutineOpencodeOptions(enabled: boolean) {
    return useQuery({
        queryKey: routineKeys.opencode,
        queryFn: async () => unwrapApi((await api.get<ApiResponse<RoutineOpencodeOptionsDto>>("/routine-agents/opencode-options")).data),
        enabled,
        staleTime: 30_000,
    })
}
