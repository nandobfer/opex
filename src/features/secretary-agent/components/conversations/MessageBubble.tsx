"use client"

import { format } from "date-fns"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Bot, Check, CheckCheck, Clock, Pencil, RotateCcw } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ChatMessageDto, ChatMessageStatus } from "@/features/evolution-api/chat-message"
import { isTempId, quotedAuthorLabel } from "../../chat-timeline"
import { BUBBLE_IN, BUBBLE_OUT } from "./chat-layout"
import { MediaContent, mediaSrc } from "./bubble/MediaContent"
import { MessageMenu, ReactionButton } from "./bubble/MessageActions"
import { QuotedPreview } from "./bubble/QuotedPreview"
import { ReactionsBadge } from "./bubble/ReactionsBadge"
import { ContactsCard, LocationCard } from "./bubble/StructuredContent"

export interface MessageBubbleProps {
    chatId: string
    message: ChatMessageDto
    contactName: string
    isGroup: boolean
    firstOfSequence: boolean
    /** Enviada pelo Secretário: selo "Secretário" (decisão D3). */
    fromAgent: boolean
    highlighted?: boolean
    previewUrl?: string | null
    error?: string | null
    onRetry?: () => void
    onReply?: (message: ChatMessageDto) => void
    onReact?: (message: ChatMessageDto, emoji: string) => void
    onOpenMedia?: (message: ChatMessageDto) => void
    onJumpTo?: (messageId: string) => void
}

/** Relógio = enviando; um check = enviada; dois = entregue; dois em destaque = lida; "!" = falha. Nunca simulados. */
export function StatusIcon({ status }: { status: ChatMessageStatus | null }) {
    const reduceMotion = useReducedMotion()
    const icon =
        status === "pending" ? <Clock className="h-3 w-3" role="img" aria-label="Enviando" />
        : status === "failed" ? <span className="text-[11px] font-bold text-destructive" role="img" aria-label="Falha no envio">!</span>
        : status === "sent" ? <Check className="h-3.5 w-3.5" role="img" aria-label="Enviada" />
        : status === "delivered" ? <CheckCheck className="h-3.5 w-3.5" role="img" aria-label="Entregue" />
        : status === "read" ? <CheckCheck className="h-3.5 w-3.5 text-[var(--chart-info-1)]" role="img" aria-label="Lida" />
        : null
    if (!icon) return null
    return (
        <AnimatePresence mode="wait" initial={false}>
            <motion.span key={status} className="inline-flex" initial={reduceMotion ? false : { opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={reduceMotion ? undefined : { opacity: 0, scale: 0.6 }} transition={{ duration: 0.16 }}>
                {icon}
            </motion.span>
        </AnimatePresence>
    )
}

const authorOf = (message: Pick<ChatMessageDto, "authorName" | "author">) => message.authorName ?? message.author?.split("@")[0] ?? "Participante"

/** Balão no padrão do WhatsApp Web (cópia do Atendimento), com a paleta do Opex: entrada à esquerda, do dono na primária. */
export function MessageBubble(props: MessageBubbleProps) {
    const { chatId, message, contactName, isGroup, firstOfSequence, fromAgent, highlighted, previewUrl, error, onRetry, onReply, onReact, onOpenMedia, onJumpTo } = props
    const reduceMotion = useReducedMotion()
    const out = message.fromMe
    const sticker = message.media?.kind === "sticker"
    const bareMedia = Boolean(message.media && (message.media.kind === "image" || message.media.kind === "video") && !message.text)
    const interactive = !isTempId(message.id) && message.kind !== "deleted"
    const myReaction = message.reactions.find((reaction) => reaction.fromMe)?.emoji ?? null
    const downloadHref = message.media && interactive ? mediaSrc(chatId, message) : null
    const quoted = message.quoted
    return (
        <motion.div
            initial={{ opacity: 0, y: reduceMotion ? 0 : 6, scale: reduceMotion ? 1 : 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className={cn("group flex items-end gap-1 px-2", out ? "flex-row-reverse" : "flex-row", firstOfSequence ? "mt-2" : "mt-0.5", message.reactions.length > 0 && "mb-3")}
            data-direction={out ? "out" : "in"}
            data-status={message.status ?? undefined}
            data-message-id={message.id}
        >
            <div
                className={cn(
                    "relative min-w-[84px] max-w-[78%] rounded-lg text-[13.5px] leading-[19px] md:max-w-[65%]",
                    sticker ? "bg-transparent p-0" : cn("px-2 pb-1 pt-1.5 shadow-sm", out ? BUBBLE_OUT : BUBBLE_IN, bareMedia && "p-1"),
                    firstOfSequence && !sticker && (out ? "rounded-tr-none" : "rounded-tl-none"),
                    highlighted && "ring-2 ring-ring transition-shadow",
                )}
            >
                <MessageMenu out={out} canReply={interactive && Boolean(onReply)} downloadHref={downloadHref} onReply={() => onReply?.(message)} />
                {out && firstOfSequence && fromAgent && (
                    <p className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold opacity-90" data-from-agent="">
                        <Bot className="h-3 w-3" aria-hidden /> Secretário
                    </p>
                )}
                {!out && isGroup && firstOfSequence && <p className="mb-0.5 truncate text-[11px] font-semibold text-[var(--chart-info-2)]">{authorOf(message)}</p>}
                {quoted && <QuotedPreview author={quotedAuthorLabel(quoted.author, chatId, contactName, isGroup)} text={quoted.text} className="mb-1" onClick={onJumpTo ? () => onJumpTo(quoted.id) : undefined} />}
                {message.media && <MediaContent chatId={chatId} message={message} previewUrl={previewUrl} onOpen={onOpenMedia} />}
                {message.kind === "location" && message.location && <LocationCard location={message.location} />}
                {message.kind === "contact" && <ContactsCard contacts={message.contacts} />}
                {message.kind === "deleted" ? (
                    <p className="italic opacity-70">Mensagem apagada<span className="inline-block w-16" aria-hidden /></p>
                ) : message.kind === "unsupported" ? (
                    <p className="italic opacity-70">{message.text || "Mensagem não suportada. Veja no celular."}<span className="inline-block w-16" aria-hidden /></p>
                ) : message.text && message.kind !== "location" ? (
                    <p className="mt-0.5 whitespace-pre-wrap break-words">
                        {message.text}
                        {/* Reserva espaço para a hora não colidir com o texto. */}
                        <span className="inline-block w-16" aria-hidden />
                    </p>
                ) : !bareMedia && !sticker && <span className="block h-4" aria-hidden />}
                <span className={cn("absolute bottom-1 right-2 flex items-center gap-1 text-[11px] leading-none", bareMedia ? "bottom-2 right-3 rounded-full bg-background/60 px-1.5 py-0.5 text-foreground" : "opacity-70")}>
                    {message.edited && <Pencil className="h-2.5 w-2.5" aria-label="Editada" />}
                    <time dateTime={message.timestamp}>{format(new Date(message.timestamp), "HH:mm")}</time>
                    {out && <StatusIcon status={message.status} />}
                </span>
                {out && message.status === "failed" && (
                    <div className="mt-1 flex items-center justify-between gap-2 border-t border-destructive pt-1 text-[11px] text-destructive-foreground">
                        <span className="min-w-0 truncate">{error ?? "Não enviada"}</span>
                        {onRetry && (
                            <button type="button" onClick={onRetry} className="inline-flex shrink-0 items-center gap-1 font-semibold hover:underline">
                                <RotateCcw className="h-3 w-3" aria-hidden /> Reenviar
                            </button>
                        )}
                    </div>
                )}
                <ReactionsBadge reactions={message.reactions} out={out} contactName={contactName} />
            </div>
            {interactive && onReact && <ReactionButton current={myReaction} onReact={(emoji) => onReact(message, emoji)} />}
        </motion.div>
    )
}
