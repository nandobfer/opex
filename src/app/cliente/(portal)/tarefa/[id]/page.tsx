import type { Metadata } from "next"
import { ClienteTaskDetailPage } from "@/features/orcamentos/portal/ClienteTaskDetailPage"

export const metadata: Metadata = { title: "Tarefa · Portal", robots: { index: false, follow: false } }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    return <ClienteTaskDetailPage id={id} />
}
