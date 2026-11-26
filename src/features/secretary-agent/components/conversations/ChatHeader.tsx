"use client"

import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { ArrowLeft, Ban, Pause, Play, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { LabelAvatar } from "@/components/ui/avatar-label"
import { cn } from "@/lib/utils"
import { CONVERSATION_STATE_LABELS } from "../../constants"
import type { SecretaryConversationDto } from "../../types"
import { CHAT_HEADER_HEIGHT } from "./chat-layout"
import { ConversationActionsMenu, useConversationActions } from "./ConversationActions"

/** Estado do Secretário na conversa ("Pausado até …", "Nunca responder", "Aguardando o dono", "Ativo"). */
export function agentStateText(row: Pick<SecretaryConversationDto, "state" | "pausedUntil">): string {
    const label = CONVERSATION_STATE_LABELS[row.state]
    return row.state === "paused" && row.pausedUntil ? `${label} até ${format(new Date(row.pausedUntil), "Pp", { locale: ptBR })}` : label
}

/** Cabeçalho da conversa: foto, nome, número ou "Grupo", o estado do Secretário e as ações (decisão D4). */
export function ChatHeader({ conversation, minutes, onBack }: { conversation: SecretaryConversationDto; minutes: number; onBack: () => void }) {
    const actions = useConversationActions(conversation, minutes)
    return (
        <header className={cn(CHAT_HEADER_HEIGHT, "flex shrink-0 items-center gap-2 border-b border-border bg-card px-3")}>
            <button type="button" onClick={onBack} className="rounded p-1 text-muted-foreground hover:bg-foreground/5 md:hidden" aria-label="Voltar para a lista de conversas">
                <ArrowLeft className="h-5 w-5" />
            </button>
            <LabelAvatar name={conversation.name} image={conversation.pictureUrl} className="h-10 w-10 text-sm" />
            <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{conversation.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                    {[conversation.isGroup ? "Grupo" : conversation.number ? `+${conversation.number}` : null, `Secretário: ${agentStateText(conversation)}`].filter(Boolean).join(" · ")}
                </span>
            </span>
            <Button type="button" size="sm" variant="outline" className="hidden sm:inline-flex" disabled={actions.pending} onClick={actions.togglePause}>
                {actions.paused ? <Play aria-hidden /> : <Pause aria-hidden />} {actions.paused ? "Retomar" : "Pausar"}
            </Button>
            <Button type="button" size="sm" variant="outline" className="hidden sm:inline-flex" disabled={actions.pending} onClick={actions.toggleExclude}>
                {actions.excluded ? <Undo2 aria-hidden /> : <Ban aria-hidden />} {actions.excluded ? "Voltar a responder" : "Nunca responder"}
            </Button>
            <ConversationActionsMenu actions={actions} label="Mais ações da conversa" />
            {actions.confirm}
        </header>
    )
}
