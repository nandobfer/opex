"use client"

import type { ReactNode } from "react"
import { AgentChatNavItem } from "@/features/opex-agent/components/agents/AgentChatNavItem"
import { AppShell } from "./AppShell"
import { APP_NAV, EVEN_PADDING_PAGE_HREFS, HOME_HREF, PERSISTENT_PAGE_HREFS } from "../navigation"

interface AppLayoutShellProps {
    ownerName: string
    version?: string
    children: ReactNode
}

/** Item único dos agentes de chat (Agente Opex e Agente Maddox) no rodapé do menu do dono. */
const ownerFooterItems = (collapsed: boolean) => <AgentChatNavItem collapsed={collapsed} />

/** Casca do app: marca, menu e dono (uso pessoal; acesso protegido por login). */
export function AppLayoutShell({ ownerName, version, children }: AppLayoutShellProps) {
    return (
        <AppShell
            brand={{ name: "Opex", subtitle: "Tarefas e integrações", homeHref: HOME_HREF }}
            sections={APP_NAV}
            navLabel="Menu principal"
            persistentHrefs={PERSISTENT_PAGE_HREFS}
            evenPaddingHrefs={EVEN_PADDING_PAGE_HREFS}
            ownerName={ownerName}
            version={version}
            sidebarFooterItems={ownerFooterItems}
        >
            {children}
        </AppShell>
    )
}
