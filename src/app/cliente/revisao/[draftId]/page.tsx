import type { Metadata } from "next"
import { ClienteRevisaoPage } from "@/features/orcamentos/portal/ClienteRevisaoPage"
import { ClienteMissingToken } from "@/features/orcamentos/portal/ClienteMissingToken"

export const metadata: Metadata = {
    title: "Revisão · Portal",
    robots: { index: false, follow: false },
}

/** Revisão da prévia do portal do cliente (público, autenticado pelo token em `?t=`). */
export default async function ClienteRevisaoRoute({ params, searchParams }: { params: Promise<{ draftId: string }>; searchParams: Promise<{ t?: string }> }) {
    const [{ draftId }, { t }] = await Promise.all([params, searchParams])
    if (!t) return <ClienteMissingToken />
    return <ClienteRevisaoPage token={t} draftId={draftId} />
}
