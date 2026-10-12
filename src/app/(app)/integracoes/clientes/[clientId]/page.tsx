import type { Metadata } from "next"
import { ClienteConfigPage } from "@/features/orcamentos/components/clients/ClienteConfigPage"

export const metadata: Metadata = { title: "Cliente · Orçamentos", robots: { index: false, follow: false } }

/** Configuração de um cliente do portal de Orçamentos (dono). */
export default async function OrcamentoClientePage({ params }: { params: Promise<{ clientId: string }> }) {
    const { clientId } = await params
    return <ClienteConfigPage clientId={clientId} />
}
