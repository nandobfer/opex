"use client"

import { useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { useOpexSessions, useUpdateOpexSession } from "../../hooks/useOpexSessions"
import { OPEX_DRAFT_TAB, useOpexTabs } from "../../hooks/useOpexTabs"
import { OpexChat } from "../chat/OpexChat"
import { OpexDraftChat } from "../chat/OpexDraftChat"
import { OpexSessionTabs } from "../OpexSessionTabs"
import { OpexSessionsPanel } from "../OpexSessionsPanel"
import { useOpexScope } from "../OpexScopeProvider"
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
 * vem do escopo (`OpexScopeProvider`): rotas, eventos, abas e cor mudam, a interface é a mesma.
 */
export function AgentChatPanel({ maximized, onToggleMaximize, onClose, focusSessionId, onFocused }: AgentChatPanelProps) {
    const { agent } = useOpexScope()
    const sessions = useOpexSessions()
    const update = useUpdateOpexSession()
    const { tabs, ready, open, close, activate, startDraft } = useOpexTabs(sessions.data)
    const [listOpen, setListOpen] = useState(false)
    const [handoff, setHandoff] = useState<{ sessionId: string; text: string } | null>(null)
    const [draftModel, setDraftModel] = useState<{ model: string; variant: string | null } | null>(null)
    const byId = useMemo(() => new Map((sessions.data ?? []).map((session) => [session.id, session])), [sessions.data])
    const active = tabs.active ?? OPEX_DRAFT_TAB

    useEffect(() => {
        if (!focusSessionId || !ready || !sessions.data) return
        if (sessions.data.some((session) => session.id === focusSessionId)) open(focusSessionId)
        onFocused?.()
    }, [focusSessionId, ready, sessions.data, open, onFocused])

    const activeSession = active === OPEX_DRAFT_TAB ? null : (byId.get(active) ?? null)
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

    const newSession = () => {
        startDraft()
        setListOpen(false)
    }

    return (
        <div className="flex h-full min-h-0 flex-col">
            <AgentSwitcherHeader listOpen={listOpen} onToggleList={() => setListOpen((value) => !value)} onNew={newSession} maximized={maximized} onToggleMaximize={onToggleMaximize} onClose={onClose} sessionModel={sessionModel} />

            <div className="border-b bg-muted/30 pt-1.5">{ready && <OpexSessionTabs open={tabs.open} active={active} sessions={byId} onActivate={activate} onClose={close} />}</div>

            <div className="relative flex min-h-0 flex-1 flex-col bg-background">
                <AnimatePresence mode="wait" initial={false}>
                    <motion.div key={active} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.16 }} className="flex min-h-0 flex-1 flex-col">
                        {!ready ? null : active === OPEX_DRAFT_TAB ? (
                            <OpexDraftChat
                                model={draftModel}
                                onCreated={(sessionId, text) => {
                                    if (text) setHandoff({ sessionId, text })
                                    setDraftModel(null)
                                    open(sessionId)
                                }}
                            />
                        ) : (
                            <OpexChat sessionId={active} initialText={handoff?.sessionId === active ? handoff.text : undefined} />
                        )}
                    </motion.div>
                </AnimatePresence>
                <AnimatePresence>
                    {listOpen && (
                        <OpexSessionsPanel
                            activeId={active}
                            onOpen={(id) => {
                                open(id)
                                setListOpen(false)
                            }}
                            onNew={newSession}
                            onClose={() => setListOpen(false)}
                        />
                    )}
                </AnimatePresence>
            </div>
        </div>
    )
}
