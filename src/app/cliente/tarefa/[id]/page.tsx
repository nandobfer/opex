import type { Metadata } from "next"
import { ClienteTaskDetailPage } from "@/features/orcamentos/portal/ClienteTaskDetailPage"
import { ClienteMissingToken } from "@/features/orcamentos/portal/ClienteMissingToken"

export const metadata: Metadata = {
    title: "Tarefa · Portal",
    robots: { index: false, follow: false },
}

/** Página da tarefa do portal do cliente (público, autenticado pelo token em `?t=`). */
export default async function ClienteTarefaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string }> }) {
    const [{ id }, { t }] = await Promise.all([params, searchParams])
    if (!t) return <ClienteMissingToken />
    return <ClienteTaskDetailPage token={t} id={id} />
}
