import type { Metadata } from "next"
import { ClienteServiceDetailPage } from "@/features/orcamentos/portal/ClienteServiceDetailPage"

export const metadata: Metadata = { title: "Serviço · Portal", robots: { index: false, follow: false } }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    return <ClienteServiceDetailPage id={id} />
}
