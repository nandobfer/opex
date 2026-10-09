"use client"

import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import { integrationDebugChannel } from "@/lib/integrations/catalog"
import { integrationDetailKey, integrationsListKey } from "@/features/integrations/hooks/useIntegrations"
import { GO_SIPAL_SESSION_EVENT, type GoSipalSessionDto } from "../session/types"

/** Sessão do Go! Sipal (card em Integrações › Go! Sipal). */

const BASE = "/integrations/go_sipal/session"
export const goSipalSessionKey = ["integrations", "go_sipal", "session"] as const

function applySession(queryClient: QueryClient, session: GoSipalSessionDto) {
    queryClient.setQueryData(goSipalSessionKey, session)
    void queryClient.invalidateQueries({ queryKey: integrationDetailKey("go_sipal") })
    void queryClient.invalidateQueries({ queryKey: integrationsListKey })
}

export function useGoSipalSession() {
    return useQuery({
        queryKey: goSipalSessionKey,
        queryFn: async () => unwrapApi((await api.get<ApiResponse<GoSipalSessionDto>>(BASE)).data),
        // Recalcula "faltam N dias"/expiração do código mesmo sem eventos.
        refetchInterval: 60_000,
    })
}

/** Atualiza o card quando a sessão muda em outra aba/instância. */
export function useGoSipalSessionLive(): void {
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!isPusherClientAvailable()) return
        const name = integrationDebugChannel("go_sipal")
        const channel = acquireChannel(name)
        const handler = () => void queryClient.invalidateQueries({ queryKey: goSipalSessionKey })
        channel.bind(GO_SIPAL_SESSION_EVENT, handler)
        return () => {
            channel.unbind(GO_SIPAL_SESSION_EVENT, handler)
            releaseChannel(name)
        }
    }, [queryClient])
}

export function useSendGoSipalCode() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async () => unwrapApi((await api.post<ApiResponse<GoSipalSessionDto>>(`${BASE}/code`)).data),
        onSuccess: (session) => {
            applySession(queryClient, session)
            toast.success(`Código enviado para ${session.pending?.email ?? "o e-mail configurado"}`)
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível enviar o código")),
    })
}

export function useCancelGoSipalCode() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async () => unwrapApi((await api.delete<ApiResponse<GoSipalSessionDto>>(`${BASE}/code`)).data),
        onSuccess: (session) => applySession(queryClient, session),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível cancelar")),
    })
}

/** Erro fica no próprio campo do código (sem toast). */
export function useVerifyGoSipalCode() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (code: string) => unwrapApi((await api.post<ApiResponse<GoSipalSessionDto>>(`${BASE}/verify`, { code })).data),
        onSuccess: (session) => {
            applySession(queryClient, session)
            toast.success(`Conectado ao Go! Sipal${session.user?.name ? ` como ${session.user.name}` : ""}`)
        },
    })
}

export function useDisconnectGoSipal() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async () => unwrapApi((await api.delete<ApiResponse<GoSipalSessionDto>>(BASE)).data),
        onSuccess: (session) => {
            applySession(queryClient, session)
            toast.success("Sessão do Go! Sipal desconectada")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível desconectar")),
    })
}
