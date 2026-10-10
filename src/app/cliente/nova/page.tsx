import type { Metadata } from "next"
import { ClienteNovaTarefaPage } from "@/features/orcamentos/portal/ClienteNovaTarefaPage"
import { ClienteMissingToken } from "@/features/orcamentos/portal/ClienteMissingToken"

export const metadata: Metadata = {
    title: "Nova tarefa · Portal",
    robots: { index: false, follow: false },
}

/** Nova tarefa do portal do cliente (público, autenticado pelo token em `?t=`). */
export default async function ClienteNovaPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
    const { t } = await searchParams
    if (!t) return <ClienteMissingToken />
    return <ClienteNovaTarefaPage token={t} />
}
