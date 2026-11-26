"use client"

import { useCallback } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { MessagesSquare } from "lucide-react"
import { urlFilterCodecs, useUrlFilters, type UrlFilterSchema } from "@/hooks/useUrlFilters"
import { cn } from "@/lib/utils"
import type { EvolutionContactDto } from "@/features/evolution-api/types"
import { CONVERSATION_STATE_LABELS, type ConversationAgentState } from "../../constants"
import { CONVERSATION_FILTERS } from "../../chat-timeline"
import { CONVERSATION_PARAM } from "../../memory-focus"
import { useSecretaryChatRealtime, useSecretaryConversations } from "../../hooks/useSecretaryChat"
import { CHAT_BG, INBOX_HEIGHT, LIST_COLUMN } from "./chat-layout"
import { ConversationListPane, type InboxListFilters } from "./ConversationListPane"
import { ConversationView, ConversationViewSkeleton } from "./ConversationView"

type InboxUrl = InboxListFilters & { [CONVERSATION_PARAM]: string }
const DEFAULTS: InboxUrl = { busca: "", filtro: "todas", secretario: [], [CONVERSATION_PARAM]: "" }
const SCHEMA: UrlFilterSchema<InboxUrl> = {
    busca: urlFilterCodecs.string(),
    filtro: urlFilterCodecs.string(CONVERSATION_FILTERS),
    secretario: urlFilterCodecs.strings<ConversationAgentState>(Object.keys(CONVERSATION_STATE_LABELS) as ConversationAgentState[]),
    [CONVERSATION_PARAM]: urlFilterCodecs.string(),
}

/**
 * Aba Conversas do Agente Secretário como conversa de verdade (OPE-197), no molde do Atendimento do Zaturno CRM sem os
 * recursos de CRM: lista à esquerda, conversa à direita (no celular, uma de cada vez). A conversa aberta e os filtros
 * ficam na URL (`?conversa=<id>`).
 */
export function ConversationsInbox({ minutes, contacts }: { minutes: number; contacts: EvolutionContactDto[] }) {
    const reduceMotion = useReducedMotion()
    const [url, setUrl] = useUrlFilters(DEFAULTS, SCHEMA)
    const list = useSecretaryConversations()
    const activeId = url[CONVERSATION_PARAM] || null
    useSecretaryChatRealtime(activeId)
    const active = list.data?.find((row) => row.chatId === activeId) ?? null
    const select = useCallback((chatId: string) => setUrl((current) => ({ ...current, [CONVERSATION_PARAM]: chatId })), [setUrl])
    const back = useCallback(() => setUrl((current) => ({ ...current, [CONVERSATION_PARAM]: "" })), [setUrl])
    const setFilters = useCallback((patch: Partial<InboxListFilters>) => setUrl((current) => ({ ...current, ...patch })), [setUrl])

    return (
        <div className={cn("flex overflow-hidden rounded-lg border border-border bg-card", INBOX_HEIGHT)} data-testid="secretary-inbox">
            <aside className={cn("flex min-h-0 flex-1 overflow-hidden border-r border-border md:flex-none md:shrink-0", LIST_COLUMN, activeId && "hidden md:flex")} aria-label="Conversas">
                <ConversationListPane
                    rows={list.data}
                    isLoading={list.isPending}
                    isError={list.isError}
                    onRetry={() => void list.refetch()}
                    filters={url}
                    onFilters={setFilters}
                    activeId={activeId}
                    onSelect={select}
                    minutes={minutes}
                />
            </aside>
            <section className={cn("min-h-0 min-w-0 flex-1", !activeId && "hidden md:block")} aria-label="Conversa aberta">
                <AnimatePresence mode="wait" initial={false}>
                    {activeId ? (
                        <motion.div key={activeId} className="h-full" initial={{ opacity: 0, x: reduceMotion ? 0 : 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reduceMotion ? 0 : -8 }} transition={{ duration: 0.2, ease: "easeOut" }}>
                            {active ? <ConversationView conversation={active} contacts={contacts} minutes={minutes} onBack={back} /> : list.isPending ? <ConversationViewSkeleton /> : (
                                <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted-foreground">
                                    <MessagesSquare className="h-10 w-10" aria-hidden />
                                    Conversa não encontrada na lista.
                                    <button type="button" className="font-medium text-primary hover:underline" onClick={back}>Voltar para a lista</button>
                                </div>
                            )}
                        </motion.div>
                    ) : (
                        <motion.div key="vazio" className={cn("flex h-full flex-col items-center justify-center gap-3 px-6 text-center", CHAT_BG)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <MessagesSquare className="h-12 w-12 text-muted-foreground" aria-hidden />
                            <p className="text-base font-medium">Selecione uma conversa</p>
                            <p className="max-w-sm text-sm text-muted-foreground">Escolha uma conversa na lista para ver as mensagens, as decisões do Secretário e responder.</p>
                        </motion.div>
                    )}
                </AnimatePresence>
            </section>
        </div>
    )
}
