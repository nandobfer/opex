"use client"

import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { clientChannel } from "@/lib/pusher/channel-names"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import { useClientePortal } from "@/features/orcamentos/portal/ClientePortalContext"
import { CLIENTE_QUERY_KEY } from "@/features/orcamentos/portal/hooks"
import { CLIENTE_ENVIRONMENTS_EVENT, PORTAL_ACTION_LABELS, type PortalEnvironmentAction } from "../constants"
import type { PortalEnvironmentDto } from "../types"

/** Ambientes no portal do cliente: lista (estado a cada 15 s), ações do admin e tempo real. */

export const portalEnvironmentsKey = (clientId: string) => [CLIENTE_QUERY_KEY, "environments", clientId] as const

export function usePortalEnvironments() {
    const { api, clientId } = useClientePortal()
    return useQuery({
        queryKey: portalEnvironmentsKey(clientId),
        queryFn: async () => unwrapApi((await api.get<ApiResponse<PortalEnvironmentDto[]>>("/cliente/ambientes")).data),
        refetchInterval: 15_000,
    })
}

/**
 * Implantar / levantar / reiniciar (admin do cliente). Resposta otimista no deploy (a linha passa a
 * "Implantando"), revertida com toast em caso de falha.
 */
export function usePortalEnvironmentAction() {
    const { api, clientId } = useClientePortal()
    const queryClient = useQueryClient()
    const key = portalEnvironmentsKey(clientId)
    return useMutation({
        mutationFn: async ({ id, action }: { id: string; action: PortalEnvironmentAction }) => unwrapApi((await api.post<ApiResponse<{ started: boolean }>>(`/cliente/ambientes/${id}/actions`, { action })).data),
        onMutate: async ({ id, action }) => {
            await queryClient.cancelQueries({ queryKey: key })
            const previous = queryClient.getQueryData<PortalEnvironmentDto[]>(key)
            if (action === "deploy") queryClient.setQueryData<PortalEnvironmentDto[]>(key, (current) => current?.map((env) => (env.id === id ? { ...env, deploying: true } : env)))
            return { previous }
        },
        onError: (error, { action }, context) => {
            if (context?.previous) queryClient.setQueryData(key, context.previous)
            toast.error(apiErrorMessage(error, `Não foi possível ${PORTAL_ACTION_LABELS[action].toLowerCase()} o ambiente`))
        },
        onSuccess: (_result, { action }) => {
            toast.success(action === "deploy" ? "Deploy iniciado" : action === "up" ? "Ambiente levantado" : "Ambiente reiniciado")
        },
        onSettled: () => void queryClient.invalidateQueries({ queryKey: key }),
    })
}

/** Recarrega a lista quando o servidor avisa `{ id, change }` no canal do cliente. Nunca publica. */
export function usePortalEnvironmentsRealtime(): void {
    const { clientId } = useClientePortal()
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!isPusherClientAvailable()) return
        const name = clientChannel(clientId)
        const channel = acquireChannel(name)
        const handler = () => void queryClient.invalidateQueries({ queryKey: portalEnvironmentsKey(clientId) })
        channel.bind(CLIENTE_ENVIRONMENTS_EVENT, handler)
        return () => {
            channel.unbind(CLIENTE_ENVIRONMENTS_EVENT, handler)
            releaseChannel(name)
        }
    }, [clientId, queryClient])
}
