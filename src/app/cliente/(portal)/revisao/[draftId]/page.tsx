import type { Metadata } from "next"
import { ClienteRevisaoPage } from "@/features/orcamentos/portal/ClienteRevisaoPage"

export const metadata: Metadata = { title: "Revisão · Portal", robots: { index: false, follow: false } }

export default async function Page({ params }: { params: Promise<{ draftId: string }> }) {
    const { draftId } = await params
    return <ClienteRevisaoPage draftId={draftId} />
}
