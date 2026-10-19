"use client"

import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import { randomId } from "@/lib/random-id"
import type { ApiResponse } from "@/lib/types/api"
import { appChannel } from "@/lib/pusher/channel-names"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import { OPEX_SESSION_DELETED_EVENT, OPEX_SESSION_UPDATED_EVENT } from "../constants"
import type { OpexConfirmationDto, OpexFileDto, OpexMessageDto, OpexSessionDetailDto, OpexSessionDto } from "../types"

/** Consultas e mutações das sessões do Agente Opex. */

export const OPEX_QUERY_KEY = "opex-agent"
export const opexSessionsKey = [OPEX_QUERY_KEY, "sessions"] as const
export const opexSessionKey = (id: string) => [OPEX_QUERY_KEY, "session", id] as const

const get = async <T,>(path: string) => unwrapApi((await api.get<ApiResponse<T>>(path)).data)

export const useOpexSessions = (enabled = true) => useQuery({ queryKey: opexSessionsKey, queryFn: () => get<OpexSessionDto[]>("/opex/sessions"), enabled, staleTime: 30_000 })

export const useOpexSession = (id: string | null) =>
    useQuery({ queryKey: opexSessionKey(id ?? ""), queryFn: () => get<OpexSessionDetailDto>(`/opex/sessions/${id}`), enabled: Boolean(id), staleTime: 30_000 })

function patchSessionInList(list: OpexSessionDto[] | undefined, session: OpexSessionDto): OpexSessionDto[] {
    if (!list) return [session]
    const exists = list.some((item) => item.id === session.id)
    const next = exists ? list.map((item) => (item.id === session.id ? session : item)) : [session, ...list]
    return [...next].sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))
}

export function useCreateOpexSession() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (text?: string) => unwrapApi((await api.post<ApiResponse<{ session: OpexSessionDto; message: OpexMessageDto | null }>>("/opex/sessions", text ? { text } : {})).data),
        onSuccess: ({ session, message }) => {
            queryClient.setQueryData<OpexSessionDto[]>(opexSessionsKey, (list) => patchSessionInList(list, message ? { ...session, status: "running", messageCount: 2 } : session))
            queryClient.setQueryData<OpexSessionDetailDto>(opexSessionKey(session.id), { session: message ? { ...session, status: "running" } : session, messages: message ? [message] : [] })
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível criar a sessão")),
    })
}

const OPTIMISTIC_PREFIX = "optimistic-"

export interface OpexSendInput {
    text: string
    files?: OpexFileDto[]
}

/** Envia a mensagem com resposta otimista: aparece na hora e some (com toast) se falhar. */
export function useSendOpexMessage(sessionId: string) {
    const queryClient = useQueryClient()
    const key = opexSessionKey(sessionId)
    return useMutation({
        mutationFn: async ({ text, files = [] }: OpexSendInput) =>
            unwrapApi((await api.post<ApiResponse<OpexMessageDto>>(`/opex/sessions/${sessionId}/messages`, { text, fileIds: files.map((file) => file.id) })).data),
        onMutate: async ({ text, files = [] }) => {
            await queryClient.cancelQueries({ queryKey: key })
            const previous = queryClient.getQueryData<OpexSessionDetailDto>(key)
            const optimistic: OpexMessageDto = {
                id: `${OPTIMISTIC_PREFIX}${randomId()}`,
                role: "user",
                kind: "message",
                text,
                files,
                parts: [],
                status: "complete",
                error: null,
                usage: null,
                durationMs: null,
                model: null,
                createdAt: new Date().toISOString(),
            }
            if (previous) queryClient.setQueryData<OpexSessionDetailDto>(key, { session: { ...previous.session, status: "running", lastError: null }, messages: [...previous.messages, optimistic] })
            return { previous, optimisticId: optimistic.id }
        },
        onSuccess: (message, _input, context) => {
            queryClient.setQueryData<OpexSessionDetailDto>(key, (current) =>
                current ? { ...current, messages: current.messages.map((item) => (item.id === context?.optimisticId ? message : item)) } : current,
            )
        },
        onError: (error, _input, context) => {
            if (context?.previous) queryClient.setQueryData(key, context.previous)
            toast.error(apiErrorMessage(error, "Não foi possível enviar a mensagem"))
        },
    })
}

export function useUpdateOpexSession() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async ({ id, ...input }: { id: string; title?: string; archived?: boolean }) => unwrapApi((await api.patch<ApiResponse<OpexSessionDto>>(`/opex/sessions/${id}`, input)).data),
        onMutate: async ({ id, ...input }) => {
            await queryClient.cancelQueries({ queryKey: opexSessionsKey })
            const previous = queryClient.getQueryData<OpexSessionDto[]>(opexSessionsKey)
            queryClient.setQueryData<OpexSessionDto[]>(opexSessionsKey, (list) =>
                list?.map((item) => (item.id === id ? { ...item, ...input, titleSource: input.title !== undefined ? "manual" : item.titleSource } : item)),
            )
            return { previous }
        },
        onSuccess: (session) => {
            queryClient.setQueryData<OpexSessionDto[]>(opexSessionsKey, (list) => list?.map((item) => (item.id === session.id ? session : item)))
            queryClient.setQueryData<OpexSessionDetailDto>(opexSessionKey(session.id), (current) => (current ? { ...current, session } : current))
        },
        onError: (error, _input, context) => {
            if (context?.previous) queryClient.setQueryData(opexSessionsKey, context.previous)
            toast.error(apiErrorMessage(error, "Não foi possível alterar a sessão"))
        },
    })
}

export function useDeleteOpexSession() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (id: string) => unwrapApi((await api.delete<ApiResponse<{ id: string }>>(`/opex/sessions/${id}`)).data),
        onMutate: async (id) => {
            await queryClient.cancelQueries({ queryKey: opexSessionsKey })
            const previous = queryClient.getQueryData<OpexSessionDto[]>(opexSessionsKey)
            queryClient.setQueryData<OpexSessionDto[]>(opexSessionsKey, (list) => list?.filter((item) => item.id !== id))
            return { previous }
        },
        onSuccess: (_data, id) => {
            queryClient.removeQueries({ queryKey: opexSessionKey(id) })
            toast.success("Sessão excluída")
        },
        onError: (error, _id, context) => {
            if (context?.previous) queryClient.setQueryData(opexSessionsKey, context.previous)
            toast.error(apiErrorMessage(error, "Não foi possível excluir a sessão"))
        },
    })
}

export function useInterruptOpex(sessionId: string) {
    return useMutation({
        mutationFn: async () => unwrapApi((await api.post<ApiResponse<{ id: string }>>(`/opex/sessions/${sessionId}/interrupt`, {})).data),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível parar a resposta")),
    })
}

/** Confirma ou cancela a ação pendente (o card muda na hora; volta se falhar). */
export function useDecideOpexAction(sessionId: string) {
    const queryClient = useQueryClient()
    const key = opexSessionKey(sessionId)
    const setStatus = (actionId: string, status: OpexConfirmationDto["status"]) =>
        queryClient.setQueryData<OpexSessionDetailDto>(key, (current) =>
            current
                ? {
                      ...current,
                      messages: current.messages.map((message) => ({
                          ...message,
                          parts: message.parts.map((part) => (part.type === "tool" && part.confirmation?.actionId === actionId ? { ...part, confirmation: { ...part.confirmation, status } } : part)),
                      })),
                  }
                : current,
        )
    return useMutation({
        mutationFn: async ({ actionId, decision }: { actionId: string; decision: "confirm" | "cancel" }) =>
            unwrapApi((await api.post<ApiResponse<OpexConfirmationDto>>(`/opex/actions/${actionId}`, { decision })).data),
        onMutate: ({ actionId, decision }) => {
            setStatus(actionId, decision === "confirm" ? "confirmed" : "cancelled")
            return { actionId }
        },
        onSuccess: (confirmation) => {
            setStatus(confirmation.actionId, confirmation.status)
            void queryClient.invalidateQueries({ queryKey: key })
        },
        onError: (error, { actionId }) => {
            setStatus(actionId, "pending")
            toast.error(apiErrorMessage(error, "Não foi possível registrar a decisão"))
            void queryClient.invalidateQueries({ queryKey: key })
        },
    })
}

/** Título, resumo e situação das sessões ao vivo (Pusher). */
export function useOpexRealtime(enabled: boolean): void {
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!enabled || !isPusherClientAvailable()) return
        const name = appChannel()
        const channel = acquireChannel(name)
        const onUpdated = (payload: { id?: string }) => {
            void queryClient.invalidateQueries({ queryKey: opexSessionsKey })
            if (payload?.id) void queryClient.invalidateQueries({ queryKey: opexSessionKey(payload.id) })
        }
        const onDeleted = (payload: { id?: string }) => {
            queryClient.setQueryData<OpexSessionDto[]>(opexSessionsKey, (list) => list?.filter((item) => item.id !== payload?.id))
            if (payload?.id) queryClient.removeQueries({ queryKey: opexSessionKey(payload.id) })
        }
        channel.bind(OPEX_SESSION_UPDATED_EVENT, onUpdated)
        channel.bind(OPEX_SESSION_DELETED_EVENT, onDeleted)
        return () => {
            channel.unbind(OPEX_SESSION_UPDATED_EVENT, onUpdated)
            channel.unbind(OPEX_SESSION_DELETED_EVENT, onDeleted)
            releaseChannel(name)
        }
    }, [enabled, queryClient])
}
