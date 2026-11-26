"use client"

import { useState } from "react"
import Link from "next/link"
import { Ban, Brain, MoreVertical, Pause, Play, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { CONVERSATION_PARAM } from "../../memory-focus"
import { secretarySectionPath } from "../../links"
import { useConversationAction } from "../../hooks/useSecretaryChat"
import type { SecretaryConversationDto } from "../../types"

type Row = Pick<SecretaryConversationDto, "chatId" | "name" | "state">

/**
 * Ações do Secretário numa conversa: Pausar/Retomar, Nunca responder/Voltar a responder (com confirmação) e Abrir
 * memórias. Ficam no cabeçalho do chat e num menu em cada item da lista (decisão do dono D4, 26/11/2026).
 */
export function useConversationActions(row: Row, minutes: number) {
    const action = useConversationAction(row.chatId)
    const [confirming, setConfirming] = useState(false)
    const paused = row.state === "paused"
    const excluded = row.state === "excluded"
    const togglePause = () => action.mutate(paused ? { action: "resume" } : { action: "pause", minutes })
    const toggleExclude = () => (excluded ? action.mutate({ action: "include" }) : setConfirming(true))
    const memoriesHref = secretarySectionPath("memorias", { [CONVERSATION_PARAM]: row.chatId })
    const confirm = (
        <ConfirmDialog
            open={confirming}
            onOpenChange={setConfirming}
            title="Nunca responder a esta conversa?"
            description={`O Secretário deixa de responder a ${row.name}. A conversa entra em "Nunca responder a" nos Critérios e pode voltar a qualquer momento.`}
            confirmLabel="Nunca responder"
            variant="destructive"
            pending={action.isPending}
            onConfirm={() => action.mutate({ action: "exclude" }, { onSettled: () => setConfirming(false) })}
        />
    )
    return { paused, excluded, pending: action.isPending, togglePause, toggleExclude, memoriesHref, confirm }
}

type Actions = ReturnType<typeof useConversationActions>

export function ConversationActionsMenu({ actions, label, className }: { actions: Actions; label: string; className?: string }) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button type="button" size="icon" variant="ghost" aria-label={label} className={cn("h-8 w-8 shrink-0 text-muted-foreground", className)}>
                    <MoreVertical className="h-4 w-4" aria-hidden />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem disabled={actions.pending} onSelect={actions.togglePause}>
                    {actions.paused ? <Play className="h-4 w-4" aria-hidden /> : <Pause className="h-4 w-4" aria-hidden />} {actions.paused ? "Retomar" : "Pausar"}
                </DropdownMenuItem>
                <DropdownMenuItem disabled={actions.pending} onSelect={actions.toggleExclude} className={actions.excluded ? undefined : "text-destructive"}>
                    {actions.excluded ? <Undo2 className="h-4 w-4" aria-hidden /> : <Ban className="h-4 w-4" aria-hidden />} {actions.excluded ? "Voltar a responder" : "Nunca responder"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                    <Link href={actions.memoriesHref}>
                        <Brain className="h-4 w-4" aria-hidden /> Abrir memórias
                    </Link>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
