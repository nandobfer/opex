"use client"

import { useCallback } from "react"
import { useQueryClient, type InfiniteData } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage } from "@/lib/api"
import type { ChatMessageDto } from "@/features/evolution-api/chat-message"
import type { ChatSendInput } from "@/features/evolution-api/schemas"
import type { SendableMediaType } from "@/features/evolution-api/chat-media-rules"
import type { ChatTimelinePageDto } from "../types"
import { chatOutbox, newTempId } from "./chat-outbox"
import { timelineKey, timelinePath } from "./useSecretaryChat"

/** Rascunho de anexo (prévia antes de enviar). */
export interface AttachmentDraft {
    id: string
    file: File
    mediaType: SendableMediaType
    mimeType: string
    caption?: string
    voice?: boolean
    durationSeconds?: number
}

export interface QuotedRef {
    id: string
    text: string
    author: string | null
}

function draftMessage(chatId: string, tempId: string, patch: Partial<ChatMessageDto>): ChatMessageDto {
    return { id: tempId, chatJid: chatId, fromMe: true, author: null, authorName: null, timestamp: new Date().toISOString(), kind: "text", text: "", media: null, quoted: null, location: null, contacts: [], reactions: [], edited: false, status: "pending", ...patch }
}

const sentId = (data: unknown) => (data as { data?: { id?: string } })?.data?.id ?? null

/**
 * Envio pelo dono na aba Conversas (decisão D1: completo sem CRM), com resposta otimista: o balão entra na hora,
 * recebe o id real e, em falha, mostra "Reenviar" e um toast. O envio pela tela não grava `secretary_sent` (D2).
 */
export function useSendChatMessage(chatId: string) {
    const cache = useQueryClient()
    const refresh = useCallback(() => void cache.invalidateQueries({ queryKey: timelineKey(chatId) }), [cache, chatId])

    const run = useCallback(
        (message: Partial<ChatMessageDto>, request: () => Promise<unknown>, previewUrl: string | null = null) => {
            const tempId = newTempId()
            const attempt = () => {
                chatOutbox.patch(tempId, { error: null, message: { status: "pending" } })
                request()
                    .then((data) => {
                        chatOutbox.patch(tempId, { realId: sentId(data), message: { status: "sent" } })
                        refresh()
                    })
                    .catch((error: unknown) => {
                        const reason = apiErrorMessage(error, "Não foi possível enviar a mensagem")
                        chatOutbox.patch(tempId, { error: reason, message: { status: "failed" } })
                        toast.error(reason)
                    })
            }
            chatOutbox.add({ tempId, chatId, realId: null, message: draftMessage(chatId, tempId, message), previewUrl, error: null, retry: attempt })
            attempt()
        },
        [chatId, refresh],
    )

    const postJson = useCallback((input: ChatSendInput) => () => api.post(timelinePath(chatId), input).then((response) => response.data), [chatId])

    const sendText = (text: string, quoted: QuotedRef | null) => run({ kind: "text", text, quoted }, postJson({ type: "text", text, quotedId: quoted?.id }))
    const sendLocation = (input: Extract<ChatSendInput, { type: "location" }>, quoted: QuotedRef | null) =>
        run({ kind: "location", location: { latitude: input.latitude, longitude: input.longitude, name: input.name ?? null, address: input.address ?? null }, quoted }, postJson({ ...input, quotedId: quoted?.id }))
    const sendContacts = (contacts: { name: string; number: string }[], quoted: QuotedRef | null) =>
        run({ kind: "contact", contacts, quoted }, postJson({ type: "contact", contacts, quotedId: quoted?.id }))

    const sendFiles = (drafts: AttachmentDraft[], quoted: QuotedRef | null) => {
        for (const draft of drafts) {
            const previewUrl = draft.mediaType !== "document" && typeof URL.createObjectURL === "function" ? URL.createObjectURL(draft.file) : null
            const form = () => {
                const body = new FormData()
                body.append("file", draft.file)
                if (draft.voice) body.append("voice", "1")
                if (draft.caption) body.append("caption", draft.caption)
                if (quoted) body.append("quotedId", quoted.id)
                return api.post(timelinePath(chatId), body, { headers: { "Content-Type": "multipart/form-data" } }).then((response) => response.data)
            }
            run(
                {
                    kind: draft.mediaType,
                    text: draft.caption ?? "",
                    quoted,
                    media: { kind: draft.mediaType, mimetype: draft.mimeType, fileName: draft.file.name, seconds: draft.durationSeconds ?? null, voice: Boolean(draft.voice) },
                },
                form,
                previewUrl,
            )
        }
    }

    return { sendText, sendLocation, sendContacts, sendFiles }
}

type TimelineCache = InfiniteData<ChatTimelinePageDto, string | null>

/** Reação do dono (vazia remove), otimista: a página muda na hora e volta em falha, com toast. */
export function useReactToChatMessage(chatId: string) {
    const cache = useQueryClient()
    return (message: ChatMessageDto, emoji: string) => {
        const key = timelineKey(chatId)
        const previous = cache.getQueryData<TimelineCache>(key)
        cache.setQueryData<TimelineCache>(key, (data) =>
            data && {
                ...data,
                pages: data.pages.map((page) => ({
                    ...page,
                    // Reação antiga do dono vinda de outra página não pode cobrir a nova.
                    effects: page.effects && { ...page.effects, reactions: page.effects.reactions.filter((item) => !(item.targetId === message.id && item.reaction.fromMe)) },
                    items: page.items.map((item) => (item.id === message.id ? { ...item, reactions: [...item.reactions.filter((reaction) => !reaction.fromMe), ...(emoji ? [{ emoji, fromMe: true, author: null }] : [])] } : item)),
                })),
            },
        )
        api.post(timelinePath(chatId), { type: "reaction", messageId: message.id, fromMe: message.fromMe, emoji } satisfies ChatSendInput).catch((error: unknown) => {
            if (previous) cache.setQueryData(key, previous)
            toast.error(apiErrorMessage(error, "Não foi possível reagir"))
        })
    }
}
