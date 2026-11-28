import { notFound, redirect } from "next/navigation"
import { integrationsRegistry } from "@/features/integrations/registry/definitions"
import { IntegrationsCentralPage } from "@/features/integrations/components/IntegrationsCentralPage"

/**
 * Central de integrações inteira (`/integracoes`, `/integracoes/<id>`, `/integracoes/ia/<provedor>`,
 * `/integracoes/clientes/<cliente>`...): o registro resolve a página, os caminhos legados e os
 * redirecionamentos. Provedores customizados (`ia/custom-<slug>`) são resolvidos no navegador.
 */
export default async function IntegracoesPage({ params }: { params: Promise<{ slug?: string[] }> }) {
    const { slug = [] } = await params
    const match = integrationsRegistry.match(slug)
    if (match?.kind === "redirect") redirect(match.to)
    if (!match) notFound()
    return <IntegrationsCentralPage slug={slug} />
}
