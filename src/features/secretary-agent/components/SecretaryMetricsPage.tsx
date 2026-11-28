"use client"

import { AgentPage, type AgentPageTab } from "@/features/agent-metrics/components/AgentPage"
import { SECRETARY_PAGE_TABS, secretaryPagePath } from "../links"
import { CONVERSATION_PARAM } from "../memory-focus"
import { SecretaryConversationsTab } from "./conversations/SecretaryConversationsTab"
import { SecretaryMemoriesLinkProvider, type MemoriesHref } from "./conversations/memories-link"
import { SecretaryMemories } from "./SecretaryMemories"

const LEADING_TABS: readonly AgentPageTab[] = [{ value: SECRETARY_PAGE_TABS.conversas, label: "Conversas", render: () => <SecretaryConversationsTab /> }]
const TABS: readonly AgentPageTab[] = [{ value: SECRETARY_PAGE_TABS.memorias, label: "Memórias", render: () => <SecretaryMemories /> }]
/** "Abrir memórias" de uma conversa fica na própria página (aba Memórias focada na conversa). */
const pageMemoriesHref: MemoriesHref = (chatId) => secretaryPagePath(SECRETARY_PAGE_TABS.memorias, { [CONVERSATION_PARAM]: chatId })

/** `/agente-secretario`: Conversas (padrão, OPE-207), Visão geral, Histórico e Memórias. */
export function SecretaryMetricsPage() {
    return (
        <SecretaryMemoriesLinkProvider href={pageMemoriesHref} inPage>
            <AgentPage agent="secretario" leadingTabs={LEADING_TABS} defaultTab={SECRETARY_PAGE_TABS.conversas} tabs={TABS} />
        </SecretaryMemoriesLinkProvider>
    )
}
