"use client"

import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { appChannel } from "@/lib/pusher/channel-names"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import { OPENCODE_SERVICE_ACTION_LABELS, OPENCODE_SERVICE_UPDATED_EVENT, type OpencodeServiceAction } from "../constants"
import type { ServiceActionBody } from "../schemas"
import type { OpencodeLogsDto, OpencodeServiceOperationDto, OpencodeServiceStatusDto } from "../types"

/** Consultas e ações do serviço do OpenCode (aba Controles). */

const BASE = "/ai/providers/opencode/service"
export const OPENCODE_SERVICE_KEY = ["ai", "opencode-service"] as const
const LOGS_KEY = [...OPENCODE_SERVICE_KEY, "logs"] as const

export const useOpencodeServiceStatus = (enabled = true) =>
    useQuery({
        queryKey: OPENCODE_SERVICE_KEY,
        queryFn: async () => unwrapApi((await api.get<ApiResponse<OpencodeServiceStatusDto>>(BASE)).data),
        enabled,
        staleTime: 10_000,
        // Operação em andamento: acompanha até terminar (o Pusher também avisa).
        refetchInterval: (query) => (query.state.data?.operation?.status === "running" ? 3_000 : 30_000),
        refetchOnWindowFocus: true,
        retry: false,
    })

export const useOpencodeLogs = (lines: number, enabled = true) =>
    useQuery({
        queryKey: [...LOGS_KEY, lines],
        queryFn: async () => unwrapApi((await api.get<ApiResponse<OpencodeLogsDto>>(`${BASE}/logs`, { params: { lines } })).data),
        enabled,
        staleTime: 5_000,
        retry: false,
    })

export function useServiceAction() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async ({ action, body }: { action: OpencodeServiceAction; body?: ServiceActionBody }) =>
            unwrapApi((await api.post<ApiResponse<OpencodeServiceOperationDto>>(`${BASE}/${action}`, body ?? {}, { timeout: 0 })).data),
        onSuccess: (op) => {
            const label = OPENCODE_SERVICE_ACTION_LABELS[op.action]
            if (op.status === "running") toast.info(`${label.running}… acompanhe o andamento aqui`)
            else if (op.status === "succeeded") toast.success(label.done)
            else toast.error(op.error ?? `${label.verb} falhou`)
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível executar a ação")),
        onSettled: () => {
            void queryClient.invalidateQueries({ queryKey: OPENCODE_SERVICE_KEY })
        },
    })
}

export function useReadHostFingerprint() {
    return useMutation({
        mutationFn: async () => unwrapApi((await api.get<ApiResponse<{ fingerprint: string; trusted: string | null }>>(`${BASE}/ssh-trust`)).data),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível ler a chave do host")),
    })
}

export function useTrustHostKey() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (fingerprint: string) => unwrapApi((await api.post<ApiResponse<{ fingerprint: string }>>(`${BASE}/ssh-trust`, { fingerprint })).data),
        onSuccess: () => toast.success("Chave do host confiada"),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível confiar na chave")),
        onSettled: () => {
            void queryClient.invalidateQueries({ queryKey: OPENCODE_SERVICE_KEY })
            void queryClient.invalidateQueries({ queryKey: ["integrations"] })
        },
    })
}

export function useOpencodeServiceRealtime(): void {
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!isPusherClientAvailable()) return
        const name = appChannel()
        const channel = acquireChannel(name)
        const handler = () => void queryClient.invalidateQueries({ queryKey: OPENCODE_SERVICE_KEY })
        channel.bind(OPENCODE_SERVICE_UPDATED_EVENT, handler)
        return () => {
            channel.unbind(OPENCODE_SERVICE_UPDATED_EVENT, handler)
            releaseChannel(name)
        }
    }, [queryClient])
}
