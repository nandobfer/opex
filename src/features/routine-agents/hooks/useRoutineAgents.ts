"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import type { RoutineAgentInput, RoutineAgentSettingsInput, RoutineChannelAction, RoutineListFilter } from "../schemas"
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

/**
 * Pausar/Retomar com resposta otimista (OPE-213): o status muda na hora no agente e nas listas em cache (pausado
 * sem próximo disparo) e volta ao anterior se a chamada falhar. Arquivar/desarquivar seguem sem otimismo (o item
 * sai ou entra na lista).
 */
function patchAgentStatus(queryClient: ReturnType<typeof useQueryClient>, id: string, action: RoutineStatusAction): () => void {
    if (action !== "pause" && action !== "resume") return () => undefined
    const patch = (agent: RoutineAgentDto): RoutineAgentDto => (action === "pause" ? { ...agent, status: "paused", nextFireAt: null } : { ...agent, status: "active" })
    const previousAgent = queryClient.getQueryData<RoutineAgentDto>(routineKeys.agent(id))
    const previousLists = queryClient.getQueriesData<RoutineAgentDto[]>({ queryKey: [...routineKeys.all, "list"] })
    if (previousAgent) queryClient.setQueryData(routineKeys.agent(id), patch(previousAgent))
    for (const [key, list] of previousLists) if (list) queryClient.setQueryData(key, list.map((agent) => (agent.id === id ? patch(agent) : agent)))
    return () => {
        if (previousAgent) queryClient.setQueryData(routineKeys.agent(id), previousAgent)
        for (const [key, list] of previousLists) queryClient.setQueryData(key, list)
    }
}

export function useRoutineAgentStatus() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async ({ id, action }: { id: string; action: RoutineStatusAction }) => unwrapApi((await api.post<ApiResponse<RoutineAgentDto>>(`/routine-agents/${id}/status`, { action })).data),
        onMutate: async ({ id, action }) => {
            // Uma releitura em andamento (tempo real, revalidação) não pode sobrescrever o status otimista.
            if (action === "pause" || action === "resume")
                await Promise.all([queryClient.cancelQueries({ queryKey: routineKeys.agent(id) }), queryClient.cancelQueries({ queryKey: [...routineKeys.all, "list"] })])
            return { rollback: patchAgentStatus(queryClient, id, action) }
        },
        onSuccess: (agent, { action }) => {
            toast.success(STATUS_TOAST[action])
            queryClient.setQueryData(routineKeys.agent(agent.id), agent)
        },
        onError: (error, _input, context) => {
            context?.rollback()
            toast.error(apiErrorMessage(error, "Não foi possível alterar o status do agente"))
        },
        onSettled: () => void queryClient.invalidateQueries({ queryKey: routineKeys.all }),
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

const CHANNEL_ACTION_TOASTS: Record<RoutineChannelAction, string> = {
    block: "Canal removido e bloqueado neste agente",
    unblock: "Canal desbloqueado",
    resubscribe: "Canal assinado de novo",
}

/** Remover/bloquear, desbloquear ou assinar de novo um canal extra (OPE-143). Sem otimismo: o Engramind confirma antes. */
export function useRoutineChannelAction() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async ({ id, action, channel }: { id: string; action: RoutineChannelAction; channel: string }) => unwrapApi((await api.post<ApiResponse<RoutineAgentDto>>(`/routine-agents/${id}/provisioning/channels`, { action, channel })).data),
        onSuccess: (agent, { action }) => {
            toast.success(CHANNEL_ACTION_TOASTS[action])
            queryClient.setQueryData(routineKeys.agent(agent.id), agent)
            void queryClient.invalidateQueries({ queryKey: routineKeys.all })
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível alterar o canal do agente")),
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
