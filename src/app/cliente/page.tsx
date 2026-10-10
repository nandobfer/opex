import type { Metadata } from "next"
import { ClienteTasksPage } from "@/features/orcamentos/portal/ClienteTasksPage"
import { ClienteMissingToken } from "@/features/orcamentos/portal/ClienteMissingToken"

export const metadata: Metadata = {
    title: "Tarefas · Portal",
    robots: { index: false, follow: false },
}

/** Portal do cliente (público, autenticado pelo token em `?t=`). */
export default async function ClientePortalPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
    const { t } = await searchParams
    if (!t) return <ClienteMissingToken />
    return <ClienteTasksPage token={t} />
}
