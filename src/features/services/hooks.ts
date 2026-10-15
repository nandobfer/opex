"use client"

import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { appChannel } from "@/lib/pusher/channel-names"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import { FINANCE_QUERY_KEY } from "@/features/finance/hooks/useFinance"
import type { TaskDetailDto } from "@/features/tasks/types"
import { SERVICES_UPDATED_EVENT } from "./constants"
import type { ServiceWriteInput } from "./schemas"
import type { ServiceDto } from "./types"

/** Serviços (lançamento manual de faturamento): consultas, mutações e tempo real (dono). */

export const SERVICES_QUERY_KEY = "services"
export const serviceKey = (id: string) => [SERVICES_QUERY_KEY, "detail", id] as const

export function useService(id: string) {
    return useQuery({
        queryKey: serviceKey(id),
        queryFn: async () => unwrapApi((await api.get<ApiResponse<ServiceDto>>(`/services/${id}`)).data),
        enabled: Boolean(id),
    })
}

/**
 * Dados da tarefa que o formulário de serviço precisa ao escolher uma tarefa: cliente e repositório
 * dela (para preencher os campos automaticamente, **sem** copiar a descrição).
 */
export async function fetchTaskForService(id: string): Promise<{ clientId: string | null; projectId: string | null }> {
    const task = unwrapApi((await api.get<ApiResponse<TaskDetailDto>>(`/tasks/${id}`)).data)
    return { clientId: task.clientId ?? null, projectId: task.project?.id ?? null }
}

/** Invalida o detalhe, a lista do Financeiro e os dashboards que somam serviços. */
function invalidateServiceData(queryClient: ReturnType<typeof useQueryClient>, id?: string) {
    if (id) void queryClient.invalidateQueries({ queryKey: serviceKey(id) })
    void queryClient.invalidateQueries({ queryKey: [SERVICES_QUERY_KEY] })
    void queryClient.invalidateQueries({ queryKey: [FINANCE_QUERY_KEY] })
}

export function useCreateService() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: ServiceWriteInput) => unwrapApi((await api.post<ApiResponse<ServiceDto>>("/services", input)).data),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível criar o serviço")),
        onSuccess: (service) => {
            invalidateServiceData(queryClient, service.id)
            toast.success(`Serviço ${service.code} criado`)
        },
    })
}

export function useUpdateService(id: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: ServiceWriteInput) => unwrapApi((await api.patch<ApiResponse<ServiceDto>>(`/services/${id}`, input)).data),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível salvar o serviço")),
        onSuccess: (service) => {
            queryClient.setQueryData(serviceKey(id), service)
            invalidateServiceData(queryClient, id)
            toast.success(`Serviço ${service.code} salvo`)
        },
    })
}

export function useArchiveService() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (id: string) => unwrapApi((await api.delete<ApiResponse<{ id: string }>>(`/services/${id}`)).data),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível arquivar o serviço")),
        onSuccess: (_data, id) => {
            invalidateServiceData(queryClient, id)
            toast.success("Serviço arquivado")
        },
    })
}

export function useRestoreService() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (id: string) => unwrapApi((await api.post<ApiResponse<ServiceDto>>(`/services/${id}/restore`, {})).data),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível restaurar o serviço")),
        onSuccess: (service) => {
            invalidateServiceData(queryClient, service.id)
            toast.success(`Serviço ${service.code} restaurado`)
        },
    })
}

export function useRegenerateServiceAi(id: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async () => unwrapApi((await api.post<ApiResponse<{ id: string }>>(`/services/${id}/ai`, {})).data),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível gerar o serviço por IA")),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: serviceKey(id) })
            toast.success("Gerando por IA…")
        },
    })
}

/** Recarrega os serviços quando o servidor avisa mudança (IA, anexos, outra aba). Nunca publica eventos. */export function useServicesRealtime(): void {
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!isPusherClientAvailable()) return
        const name = appChannel()
        const channel = acquireChannel(name)
        const handler = () => {
            void queryClient.invalidateQueries({ queryKey: [SERVICES_QUERY_KEY] })
            void queryClient.invalidateQueries({ queryKey: [FINANCE_QUERY_KEY] })
        }
        channel.bind(SERVICES_UPDATED_EVENT, handler)
        return () => {
            channel.unbind(SERVICES_UPDATED_EVENT, handler)
            releaseChannel(name)
        }
    }, [queryClient])
}
