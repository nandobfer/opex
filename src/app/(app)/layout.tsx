import type { ReactNode } from "react"
import { AppLayoutShell } from "@/features/layout/components/AppLayoutShell"
import { getLocalUser } from "@/lib/local-user"

export default function AppLayout({ children }: { children: ReactNode }) {
    return (
        <AppLayoutShell ownerName={getLocalUser().name} version={process.env.APP_VERSION}>
            {children}
        </AppLayoutShell>
    )
}
