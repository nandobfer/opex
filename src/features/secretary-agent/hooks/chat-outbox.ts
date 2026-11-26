"use client"

import { useSyncExternalStore } from "react"
import type { ChatMessageDto } from "@/features/evolution-api/chat-message"

/**
 * Envios em andamento da aba Conversas (resposta otimista, OPE-197): o balão aparece na hora, troca de id quando a
 * Evolution confirma e some quando a página do servidor já traz a mensagem. Em falha fica com "Reenviar". Vive fora do
 * cache do TanStack Query para não ser apagado por um recarregamento em tempo real; sobrevive à troca de conversa.
 */

export interface OutboxItem {
    tempId: string
    chatId: string
    /** Id real depois que a Evolution confirmou. */
    realId: string | null
    message: ChatMessageDto
    /** URL local da prévia (foto, vídeo, áudio) enquanto o arquivo não vem da Evolution. */
    previewUrl: string | null
    error: string | null
    retry: () => void
}

let items: OutboxItem[] = []
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((listener) => listener())

export const chatOutbox = {
    add(item: OutboxItem) {
        items = [...items, item]
        emit()
    },
    patch(tempId: string, patch: Partial<Omit<OutboxItem, "message">> & { message?: Partial<ChatMessageDto> }) {
        items = items.map((item) => (item.tempId === tempId ? { ...item, ...patch, message: { ...item.message, ...(patch.message ?? {}) } } : item))
        emit()
    },
    remove(tempId: string) {
        const gone = items.find((item) => item.tempId === tempId)
        if (gone?.previewUrl && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(gone.previewUrl)
        items = items.filter((item) => item.tempId !== tempId)
        emit()
    },
    /** Tira os já confirmados que a página do servidor trouxe. */
    settle(chatId: string, serverIds: ReadonlySet<string>) {
        const done = items.filter((item) => item.chatId === chatId && item.realId && serverIds.has(item.realId))
        if (done.length) done.forEach((item) => chatOutbox.remove(item.tempId))
    },
    snapshot: () => items,
    reset() {
        items = []
        emit()
    },
}

const subscribe = (listener: () => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
}

export function useChatOutbox(chatId: string): OutboxItem[] {
    const all = useSyncExternalStore(subscribe, chatOutbox.snapshot, chatOutbox.snapshot)
    return all.filter((item) => item.chatId === chatId)
}

let counter = 0
export const newTempId = () => `temp-${Date.now().toString(36)}-${(counter += 1)}`
