"use client"

import type { ReactNode } from "react"
import { AgentChatNavItem } from "@/features/opex-agent/components/agents/AgentChatNavItem"
import { ServerQuotaSidebarItem } from "@/features/host-metrics/components/ServerQuotaSidebarItem"
import { IntegrationsSidebarItem } from "@/features/integrations/components/sidebar/IntegrationsSidebarItem"
import { useRoutineAttentionToasts } from "@/features/routine-agents/hooks/useRoutineRealtime"
import { AppShell } from "./AppShell"
import type { AppSidebarItemPanels } from "./AppSidebar"
import { APP_NAV, EVEN_PADDING_PAGE_HREFS, HOME_HREF, PERSISTENT_PAGE_HREFS } from "../navigation"
import { useNavWithPlugins } from "@/features/plugins/client/usePluginNav"
import { PluginSlot } from "@/features/plugins/client/PluginSlot"

interface AppLayoutShellProps {
    ownerName: string
    version?: string
    children: ReactNode
}

/** Rodapé do menu do dono: "Servidor e quota" (OPE-145) acima do item único dos agentes de chat (Agente Opex e Agente Maddox). */
const ownerFooterItems = (collapsed: boolean) => (
    <>
        {/* Slot `topbar.actions` (OPE-172): no desktop não há barra no topo; as ações ficam no rodapé do menu. */}
        {!collapsed && <PluginSlot name="topbar.actions" props={{}} className="flex flex-col gap-1 px-2" skeletonClassName="h-8" />}
        <ServerQuotaSidebarItem collapsed={collapsed} />
        <AgentChatNavItem collapsed={collapsed} />
    </>
)

/**
 * Atalhos do cabeçalho do celular (OPE-168): os mesmos itens do rodapé do menu, como botões de ícone
 * (Agente Opex e Servidor). No celular a gaveta não repete esses itens.
 */
const ownerHeaderActions = (
    <>
        <PluginSlot name="topbar.actions" props={{}} className="flex items-center gap-1" skeletonClassName="h-8 w-8" />
        <AgentChatNavItem variant="header" />
        <ServerQuotaSidebarItem variant="header" />
    </>
)

/** Submenu de Integrações no hover (OPE-120), só no menu do dono. */
const ownerItemPanels: AppSidebarItemPanels = { integrations: IntegrationsSidebarItem }

/** Casca do app: marca, menu e dono (uso pessoal; acesso protegido por login). */
export function AppLayoutShell({ ownerName, version, children }: AppLayoutShellProps) {
    // Agentes rotineiros (OPE-130): confirmação pendente e fim de execução viram toast em qualquer tela.
    useRoutineAttentionToasts()
    // Slot `sidebar.nav` (OPE-172): itens de menu declarados pelos plugins ativos.
    const sections = useNavWithPlugins(APP_NAV)
    return (
        <AppShell
            brand={{ name: "Opex", subtitle: "Tarefas e integrações", homeHref: HOME_HREF }}
            sections={sections}
            navLabel="Menu principal"
            persistentHrefs={PERSISTENT_PAGE_HREFS}
            evenPaddingHrefs={EVEN_PADDING_PAGE_HREFS}
            ownerName={ownerName}
            version={version}
            sidebarFooterItems={ownerFooterItems}
            sidebarItemPanels={ownerItemPanels}
            mobileHeaderActions={ownerHeaderActions}
        >
            {children}
        </AppShell>
    )
}
