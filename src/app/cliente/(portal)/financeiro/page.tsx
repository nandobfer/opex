import type { Metadata } from "next"
import { requirePortalAdminPage } from "@/features/auth/server/context"
import { ClienteFinanceiroPage } from "@/features/orcamentos/portal/ClienteFinanceiroPage"

export const metadata: Metadata = { title: "Financeiro · Portal", robots: { index: false, follow: false } }

/** Financeiro do portal: restrito ao **admin** do cliente (senão, volta para o dashboard). */
export default async function Page() {
    await requirePortalAdminPage()
    return <ClienteFinanceiroPage />
}
