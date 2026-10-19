"use client"

import type { ReactNode } from "react"
import { OpexNavItem } from "@/features/opex-agent/components/OpexNavItem"
import { AppShell } from "./AppShell"
import { APP_NAV, HOME_HREF, PERSISTENT_PAGE_HREFS } from "../navigation"

interface AppLayoutShellProps {
    ownerName: string
    version?: string
    children: ReactNode
}

/** Agente Opex no rodapé do menu (só no app do dono; o portal do cliente não tem). */
const ownerFooterItems = (collapsed: boolean) => <OpexNavItem collapsed={collapsed} />

/** Casca do app: marca, menu e dono (uso pessoal; acesso protegido por login). */
export function AppLayoutShell({ ownerName, version, children }: AppLayoutShellProps) {
    return (
        <AppShell
            brand={{ name: "Opex", subtitle: "Tarefas e integrações", homeHref: HOME_HREF }}
            sections={APP_NAV}
            navLabel="Menu principal"
            persistentHrefs={PERSISTENT_PAGE_HREFS}
            ownerName={ownerName}
            version={version}
            sidebarFooterItems={ownerFooterItems}
        >
            {children}
        </AppShell>
    )
}
