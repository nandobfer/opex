"use client"

import { useEffect, useMemo, useState } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { chatMessagePreview, type ChatMessageDto } from "@/features/evolution-api/chat-message"
import type { EvolutionContactDto } from "@/features/evolution-api/types"
import { mergeTimelinePages, quotedAuthorLabel } from "../../chat-timeline"
import { chatOutbox, useChatOutbox } from "../../hooks/chat-outbox"
import { useChatTimeline } from "../../hooks/useSecretaryChat"
import { useReactToChatMessage, type QuotedRef } from "../../hooks/useSendChatMessage"
import type { SecretaryConversationDto } from "../../types"
import { ChatHeader } from "./ChatHeader"
import { CHAT_BG, CHAT_HEADER_HEIGHT } from "./chat-layout"
import { ConversationWorkspace } from "./ConversationWorkspace"
import { MediaViewer } from "./MediaViewer"
import { MessageTimeline, TimelineSkeleton } from "./MessageTimeline"

interface ConversationViewProps {
    conversation: SecretaryConversationDto
    contacts: EvolutionContactDto[]
    minutes: number
    onBack: () => void
}

/**
 * Conversa aberta: cabeçalho com as ações do Secretário, linha do tempo (mensagens da Evolution, pílulas de decisão e
 * selo "Secretário") e o compositor. Abrir a conversa NUNCA marca como lida no WhatsApp (decisão do dono D6).
 */
export function ConversationView({ conversation, contacts, minutes, onBack }: ConversationViewProps) {
    const chatId = conversation.chatId
    const timeline = useChatTimeline(chatId)
    const outbox = useChatOutbox(chatId)
    const react = useReactToChatMessage(chatId)
    const merged = useMemo(() => mergeTimelinePages(timeline.data?.pages), [timeline.data])
    const [reply, setReply] = useState<{ chatId: string; quoted: QuotedRef } | null>(null)
    const replyTo = reply?.chatId === chatId ? reply.quoted : null
    const [viewerId, setViewerId] = useState<string | null>(null)

    // Envio confirmado que a página do servidor já trouxe sai da fila otimista.
    useEffect(() => {
        chatOutbox.settle(chatId, new Set(merged.messages.map((message) => message.id)))
    }, [chatId, merged.messages])

    const visualMedia = useMemo(() => merged.messages.filter((message) => message.media && (message.media.kind === "image" || message.media.kind === "video")), [merged.messages])
    const startReply = (message: ChatMessageDto) => setReply({ chatId, quoted: { id: message.id, text: chatMessagePreview(message), author: message.fromMe ? null : (message.author ?? `${chatId}@s.whatsapp.net`) } })
    const replyAuthor = replyTo ? (replyTo.author ? quotedAuthorLabel(replyTo.author, chatId, conversation.name, conversation.isGroup) : "Você") : ""

    return (
        <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
            <ChatHeader conversation={conversation} minutes={minutes} onBack={onBack} />
            <ConversationWorkspace chatId={chatId} contacts={contacts} disabled={false} replyTo={replyTo} replyAuthor={replyAuthor} onCancelReply={() => setReply(null)}>
                <MessageTimeline
                    chatId={chatId}
                    contactName={conversation.name}
                    isGroup={conversation.isGroup}
                    messages={merged.messages}
                    decisions={merged.decisions}
                    agentIds={merged.agentIds}
                    outbox={outbox.filter((item) => !item.realId || !merged.messages.some((message) => message.id === item.realId))}
                    isLoading={timeline.isLoading}
                    isError={timeline.isError}
                    onRetryLoad={() => void timeline.refetch()}
                    hasOlder={Boolean(timeline.hasNextPage)}
                    loadingOlder={timeline.isFetchingNextPage}
                    onLoadOlder={() => void timeline.fetchNextPage()}
                    onReply={startReply}
                    onReact={react}
                    onOpenMedia={(message) => setViewerId(message.id)}
                />
            </ConversationWorkspace>
            <MediaViewer chatId={chatId} items={visualMedia} openId={viewerId} onOpenChange={setViewerId} contactName={conversation.name} />
        </div>
    )
}

/** Skeleton da conversa aberta: cabeçalho e balões, com as mesmas medidas. */
export function ConversationViewSkeleton() {
    return (
        <div className="flex h-full flex-col" aria-busy="true">
            <Skeleton className={`${CHAT_HEADER_HEIGHT} w-full rounded-none`} />
            <div className={`flex-1 ${CHAT_BG}`}><TimelineSkeleton /></div>
        </div>
    )
}
