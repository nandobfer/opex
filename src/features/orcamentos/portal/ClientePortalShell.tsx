"use client"

import type { ReactNode } from "react"
import { AppShell } from "@/features/layout/components/AppShell"
import { clienteDashboardPath } from "../constants"
import { CLIENTE_PERSISTENT_HREFS, clienteNav } from "./navigation"
import type { ClientePortalSession } from "./ClientePortalContext"
import { ClienteContextBar } from "./components/ClienteContextBar"

/**
 * Casca do **portal do cliente** (layout autenticado): reusa o `AppShell` do app com a navegação do
 * portal (Dashboard, Tarefas e, para o admin, Financeiro e Usuários) e a barra de contexto do
 * cliente. Sem itens internos do dono.
 */
export function ClientePortalShell({ session, version, children }: { session: ClientePortalSession; version?: string; children: ReactNode }) {
    return (
        <AppShell
            brand={{ name: "Opex", subtitle: `Portal · ${session.clientName}`, homeHref: clienteDashboardPath() }}
            sections={clienteNav(session.isAdmin)}
            navLabel="Menu do portal"
            persistentHrefs={CLIENTE_PERSISTENT_HREFS}
            ownerName={session.user.username || session.user.email || "Usuário"}
            version={version}
        >
            <div className="space-y-5">
                <ClienteContextBar />
                {children}
            </div>
        </AppShell>
    )
}
