"use client"

import type { ReactNode } from "react"
import { AgentChatNavItem } from "@/features/opex-agent/components/agents/AgentChatNavItem"
import { ServerQuotaSidebarItem } from "@/features/host-metrics/components/ServerQuotaSidebarItem"
import { IntegrationsSidebarItem } from "@/features/integrations/components/sidebar/IntegrationsSidebarItem"
import { useRoutineAttentionToasts } from "@/features/routine-agents/hooks/useRoutineRealtime"
import { AppShell } from "./AppShell"
import type { AppSidebarItemPanels } from "./AppSidebar"
import { APP_NAV, EVEN_PADDING_PAGE_HREFS, HOME_HREF, PERSISTENT_PAGE_HREFS } from "../navigation"

interface AppLayoutShellProps {
    ownerName: string
    version?: string
    children: ReactNode
}

/** Rodapé do menu do dono: "Servidor e quota" (OPE-145) acima do item único dos agentes de chat (Agente Opex e Agente Maddox). */
const ownerFooterItems = (collapsed: boolean) => (
    <>
        <ServerQuotaSidebarItem collapsed={collapsed} />
        <AgentChatNavItem collapsed={collapsed} />
    </>
)

/** Submenu de Integrações no hover (OPE-120), só no menu do dono. */
const ownerItemPanels: AppSidebarItemPanels = { integrations: IntegrationsSidebarItem }

/** Casca do app: marca, menu e dono (uso pessoal; acesso protegido por login). */
export function AppLayoutShell({ ownerName, version, children }: AppLayoutShellProps) {
    // Agentes rotineiros (OPE-130): confirmação pendente e fim de execução viram toast em qualquer tela.
    useRoutineAttentionToasts()
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
            sidebarItemPanels={ownerItemPanels}
        >
            {children}
        </AppShell>
    )
}
