"use client"

import { History, MessageSquarePlus, PanelRightClose } from "lucide-react"
import { ActiveAgent, HeaderButton } from "@/features/opex-agent/components/agents/AgentSwitcherHeader"
import type { AgentChatState } from "@/features/opex-agent/components/agents/AgentChatBody"

/**
 * Cabeçalho da conversa com um agente rotineiro (OPE-160): o agente (avatar, nome e modelo, as mesmas
 * peças do popover do Agente Opex/Maddox), as sessões, a "Nova sessão" e o recolher para a direita.
 */
export function RoutineChatHeader({ chat, onCollapse }: { chat: AgentChatState; onCollapse: () => void }) {
    return (
        <header className="flex items-center gap-2.5 border-b bg-gradient-to-r from-primary/15 via-transparent to-transparent px-3 py-2.5">
            <ActiveAgent sessionModel={null} />
            <div className="ml-auto flex shrink-0 items-center gap-0.5">
                <HeaderButton label={chat.listOpen ? "Fechar a lista de sessões" : "Todas as sessões"} onClick={chat.toggleList} active={chat.listOpen}>
                    <History className="h-4 w-4" />
                </HeaderButton>
                <HeaderButton label="Nova sessão" onClick={chat.newSession}>
                    <MessageSquarePlus className="h-4 w-4" />
                </HeaderButton>
                <HeaderButton label="Recolher a conversa" onClick={onCollapse}>
                    <PanelRightClose className="h-4 w-4" />
                </HeaderButton>
            </div>
        </header>
    )
}
