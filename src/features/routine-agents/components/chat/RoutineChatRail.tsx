"use client"

import { History, MessageSquarePlus, PanelRightOpen } from "lucide-react"
import { HeaderButton } from "@/features/opex-agent/components/agents/AgentSwitcherHeader"
import type { AgentChatState } from "@/features/opex-agent/components/agents/AgentChatBody"
import { useOpexScope } from "@/features/opex-agent/components/OpexScopeProvider"
import { OPEX_STATUS_LABELS, OpexStatusDot } from "@/features/opex-agent/components/OpexStatusDot"
import { chatRailStatus } from "../../chat"

/**
 * Conversa recolhida (OPE-160): um contêiner compacto com o agente e a situação das conversas (aguardando
 * confirmação, respondendo, erro), expandir, nova sessão e a lista de sessões. Vertical a partir de `lg`.
 */
export function RoutineChatRail({ chat, onExpand }: { chat: AgentChatState; onExpand: () => void }) {
    const { agent } = useOpexScope()
    const Icon = agent.icon
    const sessions = chat.sessions.data ?? []
    const status = chatRailStatus(sessions, chat.activeSession?.id ?? null)
    const pending = sessions.filter((session) => session.status === "awaiting_confirmation").length
    const open = (after?: () => void) => {
        after?.()
        onExpand()
    }
    return (
        <div className="flex h-full w-full items-center gap-1 px-2 lg:flex-col lg:px-0 lg:py-2" data-testid="routine-chat-rail">
            <HeaderButton label="Expandir a conversa" side="left" onClick={() => open()}>
                <PanelRightOpen className="h-4 w-4" />
            </HeaderButton>
            <span className="relative mx-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground lg:mx-0 lg:my-1" title={`${agent.label}: ${OPEX_STATUS_LABELS[status]}`} data-testid="routine-chat-rail-status" data-status={status}>
                <Icon className="h-4 w-4" aria-hidden />
                <OpexStatusDot status={status} className="absolute -right-0.5 -top-0.5" />
            </span>
            {pending > 0 && (
                <span className="rounded-full bg-warning/20 px-1.5 text-[10px] font-semibold text-warning" title={`${pending} aguardando confirmação`} data-testid="routine-chat-rail-pending">
                    {pending}
                </span>
            )}
            <HeaderButton label="Nova sessão" side="left" onClick={() => open(chat.newSession)}>
                <MessageSquarePlus className="h-4 w-4" />
            </HeaderButton>
            <HeaderButton label="Todas as sessões" side="left" onClick={() => open(() => chat.setListOpen(true))}>
                <History className="h-4 w-4" />
            </HeaderButton>
        </div>
    )
}
