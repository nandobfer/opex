"use client"

import { useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import type { OpexSessionDto } from "../../types"
import { useOpexSessions } from "../../hooks/useOpexSessions"
import { OPEX_DRAFT_TAB, useOpexTabs } from "../../hooks/useOpexTabs"
import { OpexChat } from "../chat/OpexChat"
import { OpexDraftChat } from "../chat/OpexDraftChat"
import { OpexSessionTabs } from "../OpexSessionTabs"
import { OpexSessionsPanel } from "../OpexSessionsPanel"

type DraftModel = { model: string; variant: string | null } | null

/**
 * Estado do chat de um agente (sessões, abas, lista de sessões, "Nova sessão"), no escopo do
 * `OpexScopeProvider`. Compartilhado entre o popover do Agente Opex/Maddox e a conversa com um agente
 * rotineiro (OPE-160): cada um monta o próprio cabeçalho sobre o mesmo corpo (`AgentChatBody`).
 */
export function useAgentChat(options: { focusSessionId?: string | null; onFocused?: () => void } = {}) {
    const { focusSessionId, onFocused } = options
    const sessions = useOpexSessions()
    const { tabs, ready, open, close, activate, startDraft } = useOpexTabs(sessions.data)
    const [listOpen, setListOpen] = useState(false)
    const [handoff, setHandoff] = useState<{ sessionId: string; text: string } | null>(null)
    const [draftModel, setDraftModel] = useState<DraftModel>(null)
    const byId = useMemo(() => new Map((sessions.data ?? []).map((session) => [session.id, session])), [sessions.data])
    const active = tabs.active ?? OPEX_DRAFT_TAB

    useEffect(() => {
        if (!focusSessionId || !ready || !sessions.data) return
        if (sessions.data.some((session) => session.id === focusSessionId)) open(focusSessionId)
        onFocused?.()
    }, [focusSessionId, ready, sessions.data, open, onFocused])

    const activeSession: OpexSessionDto | null = active === OPEX_DRAFT_TAB ? null : (byId.get(active) ?? null)
    const newSession = () => {
        startDraft()
        setListOpen(false)
    }
    return { sessions, tabs, ready, open, close, activate, active, activeSession, byId, listOpen, setListOpen, toggleList: () => setListOpen((value) => !value), newSession, handoff, setHandoff, draftModel, setDraftModel }
}

export type AgentChatState = ReturnType<typeof useAgentChat>

/** Abas das sessões, o chat da aba ativa (ou a "Nova sessão") e a lista de sessões. */
export function AgentChatBody({ chat }: { chat: AgentChatState }) {
    const { ready, tabs, active, byId, activate, close, open, draftModel, setDraftModel, setHandoff, handoff, listOpen, setListOpen, newSession } = chat
    return (
        <>
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
        </>
    )
}
