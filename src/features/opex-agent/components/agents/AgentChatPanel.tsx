"use client"

import { useUpdateOpexSession } from "../../hooks/useOpexSessions"
import { OPEX_DRAFT_TAB } from "../../hooks/useOpexTabs"
import { useOpexScope } from "../OpexScopeProvider"
import { AgentChatBody, useAgentChat } from "./AgentChatBody"
import { AgentSwitcherHeader, type SessionModelChoice } from "./AgentSwitcherHeader"

export interface AgentChatPanelProps {
    maximized: boolean
    onToggleMaximize?: () => void
    onClose: () => void
    /** Sessão a ativar ao abrir (ex.: "Abrir sessão" de um job). */
    focusSessionId?: string | null
    onFocused?: () => void
}

/**
 * Conteúdo do popover de um agente de chat (compartilhado entre o Agente Opex e o Agente Maddox):
 * cabeçalho com a troca de agente, abas das sessões, lista de sessões e o chat da aba ativa. O agente
 * vem do escopo (`OpexScopeProvider`): rotas, eventos, abas e cor mudam, a interface é a mesma. O corpo
 * (`AgentChatBody`) também serve à conversa com um agente rotineiro (OPE-160).
 */
export function AgentChatPanel({ maximized, onToggleMaximize, onClose, focusSessionId, onFocused }: AgentChatPanelProps) {
    const { agent } = useOpexScope()
    const update = useUpdateOpexSession()
    const chat = useAgentChat({ focusSessionId, onFocused })
    const { active, activeSession, draftModel, setDraftModel } = chat
    const sessionModel: SessionModelChoice | null = !agent.modelPicker
        ? null
        : active === OPEX_DRAFT_TAB
          ? { override: draftModel, onChange: setDraftModel }
          : activeSession
            ? {
                  override: activeSession.modelOverride ?? null,
                  disabled: update.isPending,
                  onChange: (next) => update.mutate({ id: activeSession.id, model: next?.model ?? null, variant: next?.variant ?? null }),
              }
            : null

    return (
        <div className="flex h-full min-h-0 flex-col">
            <AgentSwitcherHeader listOpen={chat.listOpen} onToggleList={chat.toggleList} onNew={chat.newSession} maximized={maximized} onToggleMaximize={onToggleMaximize} onClose={onClose} sessionModel={sessionModel} />
            <AgentChatBody chat={chat} />
        </div>
    )
}
