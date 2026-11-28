"use client"

import { useEffect, useRef } from "react"
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage } from "@/lib/api"
import { acquireChannel, releaseChannel } from "@/lib/pusher/client"
import { appChannel } from "@/lib/pusher/channel-names"
import { EVOLUTION_QUERY_KEY } from "@/features/evolution-api/constants"
import { SECRETARY_CHAT_EVENT, type ConversationAgentState } from "../constants"
import type { ConversationActionInput } from "../schemas"
import type { ChatTimelinePageDto, SecretaryConversationDto } from "../types"

/**
 * Consultas da aba Conversas (OPE-197). As chaves começam por `/secretary/`: `secretary-decision-recorded` e
 * `secretary-conversation-updated`, que a aba já escuta, recarregam a lista e a conversa aberta (pílulas e estado).
 */

export const CONVERSATIONS_PATH = "/secretary/conversations"
export const conversationsKey = [EVOLUTION_QUERY_KEY, CONVERSATIONS_PATH] as const
export const timelinePath = (chatId: string) => `${CONVERSATIONS_PATH}/${encodeURIComponent(chatId)}/messages`
export const timelineKey = (chatId: string) => [EVOLUTION_QUERY_KEY, timelinePath(chatId)] as const

export function useSecretaryConversations() {
    return useQuery({ queryKey: conversationsKey, queryFn: async () => (await api.get<{ data: SecretaryConversationDto[] }>(CONVERSATIONS_PATH)).data.data, refetchInterval: 30_000 })
}

/**
 * Linha do tempo paginada por cursor (OPE-207): a primeira página traz as mais recentes; "Carregar mensagens
 * anteriores" pede `?antes=<nextBefore>`. Páginas vizinhas podem repetir mensagens do mesmo segundo (o cliente descarta
 * pelo id).
 */
export function useChatTimeline(chatId: string) {
    return useInfiniteQuery({
        queryKey: timelineKey(chatId),
        queryFn: async ({ pageParam }) => (await api.get<{ data: ChatTimelinePageDto }>(timelinePath(chatId), { params: pageParam ? { antes: pageParam } : {} })).data.data,
        initialPageParam: null as string | null,
        getNextPageParam: (last) => (last.hasOlder && last.nextBefore ? last.nextBefore : undefined),
    })
}

/**
 * Tempo real da aba (`secretary-chat-updated`, `{ chatId }`): recarrega só a lista (no máximo a cada 3 s) e a conversa
 * aberta. Fica fora do assinante geral do Secretário, que recarregaria todo `/secretary/*` a cada mensagem.
 */
export function useSecretaryChatRealtime(activeChatId: string | null) {
    const cache = useQueryClient()
    const active = useRef(activeChatId)
    useEffect(() => {
        active.current = activeChatId
    }, [activeChatId])
    useEffect(() => {
        const name = appChannel()
        const channel = acquireChannel(name)
        if (!channel) return
        let last = 0
        let pending: ReturnType<typeof setTimeout> | null = null
        const refreshList = () => {
            const wait = 3_000 - (Date.now() - last)
            if (wait <= 0) {
                last = Date.now()
                void cache.invalidateQueries({ queryKey: conversationsKey })
            } else if (!pending) {
                pending = setTimeout(() => {
                    pending = null
                    last = Date.now()
                    void cache.invalidateQueries({ queryKey: conversationsKey })
                }, wait)
            }
        }
        const onChat = (payload: { chatId?: string } | undefined) => {
            refreshList()
            if (payload?.chatId && payload.chatId === active.current) void cache.invalidateQueries({ queryKey: timelineKey(payload.chatId) })
        }
        channel.bind(SECRETARY_CHAT_EVENT, onChat)
        return () => {
            channel.unbind(SECRETARY_CHAT_EVENT, onChat)
            if (pending) clearTimeout(pending)
            releaseChannel(name)
        }
    }, [cache])
}

function nextState(row: SecretaryConversationDto, input: ConversationActionInput): Pick<SecretaryConversationDto, "state" | "pausedUntil"> {
    if (input.action === "pause") return { state: row.state === "excluded" ? "excluded" : "paused", pausedUntil: new Date(Date.now() + input.minutes * 60_000).toISOString() }
    if (input.action === "resume") return { state: row.state === "paused" ? "active" : row.state, pausedUntil: null }
    const state: ConversationAgentState = input.action === "exclude" ? "excluded" : "active"
    return { state, pausedUntil: row.pausedUntil }
}

/** Pausar/retomar e nunca responder/voltar a responder, com resposta otimista e reversão com toast em falha. */
export function useConversationAction(chatId: string) {
    const cache = useQueryClient()
    return useMutation({
        mutationFn: async (input: ConversationActionInput) => (await api.post(`${CONVERSATIONS_PATH}/${encodeURIComponent(chatId)}`, input)).data,
        onMutate: async (input) => {
            await cache.cancelQueries({ queryKey: conversationsKey })
            const previous = cache.getQueryData<SecretaryConversationDto[]>(conversationsKey)
            cache.setQueryData<SecretaryConversationDto[]>(conversationsKey, (rows) => rows?.map((row) => (row.chatId === chatId ? { ...row, ...nextState(row, input) } : row)))
            return { previous }
        },
        onError: (error, _input, context) => {
            if (context?.previous) cache.setQueryData(conversationsKey, context.previous)
            toast.error(apiErrorMessage(error, "Não foi possível atualizar a conversa"))
        },
        onSuccess: () => toast.success("Conversa atualizada"),
        onSettled: () => void cache.invalidateQueries({ queryKey: conversationsKey }),
    })
}
