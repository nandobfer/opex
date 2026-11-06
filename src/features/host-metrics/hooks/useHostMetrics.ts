"use client"

import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { appChannel } from "@/lib/pusher/channel-names"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import { HOST_METRICS_QUERY_KEY, HOST_METRICS_UPDATED_EVENT } from "../constants"
import { hostMetricsDtoSchema, type HostMetricsDto } from "../schemas"

/** Recursos do servidor: busca só na carga inicial; depois, só o evento em tempo real (sem polling). */
export const useHostMetrics = () =>
    useQuery({
        queryKey: [HOST_METRICS_QUERY_KEY],
        queryFn: async () => unwrapApi((await api.get<ApiResponse<HostMetricsDto>>("/host-metrics")).data),
        staleTime: Infinity,
        retry: false,
    })

/** Botão "Atualizar": lê na hora e grava o resultado no cache. */
export function useRefreshHostMetrics() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async () => unwrapApi((await api.post<ApiResponse<HostMetricsDto>>("/host-metrics/refresh")).data),
        onSuccess: (dto) => queryClient.setQueryData([HOST_METRICS_QUERY_KEY], dto),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível ler os recursos do servidor")),
    })
}

/** O evento traz o DTO inteiro: grava no cache sem nova consulta (payload inválido é ignorado). */
export function useHostMetricsRealtime(): void {
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!isPusherClientAvailable()) return
        const name = appChannel()
        const channel = acquireChannel(name)
        const handler = (payload: unknown) => {
            const parsed = hostMetricsDtoSchema.safeParse(payload)
            if (parsed.success) queryClient.setQueryData([HOST_METRICS_QUERY_KEY], parsed.data)
        }
        channel.bind(HOST_METRICS_UPDATED_EVENT, handler)
        return () => {
            channel.unbind(HOST_METRICS_UPDATED_EVENT, handler)
            releaseChannel(name)
        }
    }, [queryClient])
}
