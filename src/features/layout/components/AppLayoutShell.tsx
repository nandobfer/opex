"use client"

import type { ReactNode } from "react"
import { AppShell } from "./AppShell"
import { APP_NAV, HOME_HREF, PERSISTENT_PAGE_HREFS } from "../navigation"

interface AppLayoutShellProps {
    ownerName: string
    version?: string
    children: ReactNode
}

/** Casca do app: marca, menu e dono (sem login; uso pessoal). */
export function AppLayoutShell({ ownerName, version, children }: AppLayoutShellProps) {
    return (
        <AppShell
            brand={{ name: "Opex", subtitle: "Tarefas e integrações", homeHref: HOME_HREF }}
            sections={APP_NAV}
            navLabel="Menu principal"
            persistentHrefs={PERSISTENT_PAGE_HREFS}
            ownerName={ownerName}
            version={version}
        >
            {children}
        </AppShell>
    )
}
