"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { AnimatePresence } from "framer-motion"
import { Loader2, MessagesSquare } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/feedback/ErrorState"
import { cn } from "@/lib/utils"
import type { ChatMessageDto } from "@/features/evolution-api/chat-message"
import { buildTimelineRows } from "../../chat-timeline"
import type { TimelineDecisionDto } from "../../types"
import type { OutboxItem } from "../../hooks/chat-outbox"
import { DateDivider } from "./ChatBits"
import { BUBBLE_IN, BUBBLE_OUT, CHAT_BG } from "./chat-layout"
import { DecisionPill } from "./DecisionPill"
import { MessageBubble } from "./MessageBubble"

interface MessageTimelineProps {
    chatId: string
    contactName: string
    isGroup: boolean
    messages: ChatMessageDto[]
    decisions: TimelineDecisionDto[]
    agentIds: ReadonlySet<string>
    outbox: OutboxItem[]
    isLoading: boolean
    isError: boolean
    onRetryLoad: () => void
    hasOlder: boolean
    loadingOlder: boolean
    onLoadOlder: () => void
    onReply: (message: ChatMessageDto) => void
    onReact: (message: ChatMessageDto, emoji: string) => void
    onOpenMedia: (message: ChatMessageDto) => void
}

/** Skeleton da linha do tempo: balões dos dois lados, com as mesmas cores do resultado. */
export function TimelineSkeleton() {
    return (
        <div className="space-y-3 p-3" aria-busy="true" aria-label="Carregando mensagens">
            <Skeleton className={cn("h-10 w-2/5", BUBBLE_IN)} />
            <Skeleton className={cn("ml-auto h-10 w-1/3 opacity-60", BUBBLE_OUT)} />
            <Skeleton className={cn("h-14 w-1/2", BUBBLE_IN)} />
        </div>
    )
}

/** Linha do tempo: divisores de data, balões, pílulas de decisão do Secretário e os envios em andamento. */
export function MessageTimeline(props: MessageTimelineProps) {
    const { chatId, messages, decisions, agentIds, outbox, isLoading, isError, onRetryLoad, hasOlder, loadingOlder, onLoadOlder } = props
    const pendingById = useMemo(() => new Map(outbox.map((item) => [item.message.id, item])), [outbox])
    const all = useMemo(() => [...messages, ...outbox.map((item) => item.message)], [messages, outbox])
    const rows = useMemo(() => buildTimelineRows(all, decisions, agentIds), [all, decisions, agentIds])
    const scrollRef = useRef<HTMLDivElement>(null)
    const lastKey = all.at(-1)?.id
    const [highlighted, setHighlighted] = useState<string | null>(null)

    // Clicar na citação rola até a mensagem original e a destaca por um instante.
    const jumpTo = useCallback((messageId: string) => {
        const node = scrollRef.current?.querySelector<HTMLElement>(`[data-message-id="${messageId.replace(/["\\]/g, "\\$&")}"]`)
        if (!node) {
            toast.info("A mensagem citada é mais antiga. Carregue as mensagens anteriores para vê-la.")
            return
        }
        node.scrollIntoView({ block: "center", behavior: "smooth" })
        setHighlighted(messageId)
        setTimeout(() => setHighlighted((current) => (current === messageId ? null : current)), 1600)
    }, [])

    // Nova mensagem no fim (recebida ou enviada) leva a conversa para baixo.
    useEffect(() => {
        const node = scrollRef.current
        if (node && typeof node.scrollTo === "function") node.scrollTo({ top: node.scrollHeight })
    }, [lastKey])

    return (
        <div ref={scrollRef} className={cn("min-h-0 flex-1 overflow-y-auto px-2 py-3 md:px-10", CHAT_BG)} aria-live="polite" aria-label="Mensagens da conversa">
            {isLoading ? (
                <TimelineSkeleton />
            ) : isError ? (
                <ErrorState title="Não foi possível carregar as mensagens" onRetry={onRetryLoad} />
            ) : rows.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                    <MessagesSquare className="h-8 w-8" aria-hidden />
                    Nenhuma mensagem nesta conversa ainda.
                </div>
            ) : (
                <>
                    {hasOlder && (
                        <div className="mb-2 flex justify-center">
                            <button type="button" onClick={onLoadOlder} disabled={loadingOlder} className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm hover:text-foreground disabled:opacity-60">
                                {loadingOlder && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />} Carregar mensagens anteriores
                            </button>
                        </div>
                    )}
                    <AnimatePresence initial={false}>
                        {rows.map((row) => {
                            if (row.type === "divider") return <DateDivider key={row.key} label={row.label} />
                            if (row.type === "decision") return <DecisionPill key={row.key} decision={row.decision} />
                            const pending = pendingById.get(row.message.id)
                            return (
                                <MessageBubble
                                    key={row.key}
                                    chatId={chatId}
                                    message={row.message}
                                    contactName={props.contactName}
                                    isGroup={props.isGroup}
                                    firstOfSequence={row.firstOfSequence}
                                    fromAgent={row.fromAgent}
                                    highlighted={highlighted === row.message.id}
                                    previewUrl={pending?.previewUrl}
                                    error={pending?.error}
                                    onRetry={pending?.retry}
                                    onReply={props.onReply}
                                    onReact={props.onReact}
                                    onOpenMedia={props.onOpenMedia}
                                    onJumpTo={jumpTo}
                                />
                            )
                        })}
                    </AnimatePresence>
                </>
            )}
        </div>
    )
}
