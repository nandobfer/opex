"use client"

import type { ReactNode } from "react"
import { AppShell } from "@/features/layout/components/AppShell"
import { useMemo } from "react"
import { AgentChatNavItem } from "@/features/opex-agent/components/agents/AgentChatNavItem"
import type { OpexClientUiScope } from "@/features/opex-agent/components/OpexScopeProvider"
import { clienteDashboardPath } from "../constants"
import { CLIENTE_PERSISTENT_HREFS, clienteNav } from "./navigation"
import type { ClientePortalSession } from "./ClientePortalContext"
import { ClienteContextBar } from "./components/ClienteContextBar"
import { useClientePortal } from "./ClientePortalContext"

/**
 * Casca do **portal do cliente** (layout autenticado): reusa o `AppShell` do app com a navegação do
 * portal (Dashboard, Tarefas e, para o admin, Financeiro e Usuários) e a barra de contexto do
 * cliente. Sem itens internos do dono.
 */
export function ClientePortalShell({ session, version, children }: { session: ClientePortalSession; version?: string; children: ReactNode }) {
    const portal = useClientePortal()
    // Agentes de chat (Opex e Maddox, um item só) no rodapé do menu, no escopo do **usuário** logado.
    const client = useMemo<OpexClientUiScope>(
        () => ({ clientId: portal.clientId, clientName: portal.clientName, userId: portal.user.id, userName: portal.user.username, isAdmin: portal.isAdmin, http: portal.api }),
        [portal.clientId, portal.clientName, portal.user.id, portal.user.username, portal.isAdmin, portal.api],
    )
    const initial = useMemo(() => ({ opex: session.opexEnabled, maddox: session.maddoxEnabled }), [session.opexEnabled, session.maddoxEnabled])
    // Sem nenhum agente ligado, nem o rodapé (com o divisor) aparece.
    const footerItems = session.opexEnabled || session.maddoxEnabled ? (collapsed: boolean) => <AgentChatNavItem collapsed={collapsed} client={client} initial={initial} /> : undefined
    return (
        <AppShell
            brand={{ name: "Opex", subtitle: `Portal · ${session.clientName}`, homeHref: clienteDashboardPath() }}
            sections={clienteNav(session.isAdmin)}
            navLabel="Menu do portal"
            persistentHrefs={CLIENTE_PERSISTENT_HREFS}
            ownerName={session.user.username || session.user.email || "Usuário"}
            version={version}
            sidebarFooterItems={footerItems}
        >
            <div className="space-y-5">
                <ClienteContextBar />
                {children}
            </div>
        </AppShell>
    )
}
