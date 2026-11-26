"use client"

import { BellOff, Clock, MessageCircleQuestion } from "lucide-react"
import { LabelAvatar } from "@/components/ui/avatar-label"
import { cn } from "@/lib/utils"
import { listTime } from "../../chat-timeline"
import type { SecretaryConversationDto } from "../../types"
import { agentStateText } from "./ChatHeader"
import { PreviewIcon, UnreadBadge } from "./ChatBits"
import { ConversationActionsMenu, useConversationActions } from "./ConversationActions"

const STATE_BADGE = {
    paused: { icon: Clock, tone: "bg-[var(--chart-negative-3)]/15 text-[var(--chart-negative-3)]" },
    excluded: { icon: BellOff, tone: "bg-destructive/15 text-destructive" },
    "waiting-owner": { icon: MessageCircleQuestion, tone: "bg-primary/15 text-primary" },
} as const

/** Item da lista (molde do Atendimento): foto, nome, horário, prévia, não lidas, estado do Secretário e o menu (D4). */
export function ConversationListItem({ conversation, active, minutes, onSelect }: { conversation: SecretaryConversationDto; active: boolean; minutes: number; onSelect: (chatId: string) => void }) {
    const actions = useConversationActions(conversation, minutes)
    const unread = conversation.unreadCount ?? 0
    const preview = conversation.lastMessage
    const badge = conversation.state === "active" ? null : STATE_BADGE[conversation.state]
    return (
        <div className={cn("group relative flex items-center border-b border-border transition-colors hover:bg-muted/60", active && "bg-muted shadow-[inset_3px_0_0_var(--primary)]")} data-chat-id={conversation.chatId}>
            <button type="button" onClick={() => onSelect(conversation.chatId)} aria-current={active ? "true" : undefined} className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left">
                <LabelAvatar name={conversation.name} image={conversation.pictureUrl} className="h-11 w-11 text-sm" />
                <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                        <span className={cn("truncate text-sm", unread > 0 && "font-semibold")}>{conversation.name}</span>
                        <span className={cn("shrink-0 text-[11px] tabular-nums", unread > 0 ? "font-semibold text-primary" : "text-muted-foreground")}>{listTime(conversation.lastMessageAt)}</span>
                    </span>
                    <span className="mt-0.5 flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                            <PreviewIcon kind={preview?.kind} />
                            <span className="truncate">{preview ? `${preview.fromMe ? "Você: " : ""}${preview.text || "Mídia"}` : conversation.isGroup ? "Grupo" : (conversation.number ? `+${conversation.number}` : "Sem mensagens")}</span>
                        </span>
                        {unread > 0 && <UnreadBadge total={unread} />}
                    </span>
                    {badge && (
                        <span className={cn("mt-1 inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold", badge.tone)} data-agent-state={conversation.state}>
                            <badge.icon className="h-2.5 w-2.5" aria-hidden /> {agentStateText(conversation)}
                        </span>
                    )}
                </span>
            </button>
            <ConversationActionsMenu actions={actions} label={`Ações da conversa com ${conversation.name}`} className="mr-1" />
            {actions.confirm}
        </div>
    )
}
