import { RepoIndexProvider } from "@/features/github/components/RepoIndexProvider"
import { CatalogadorAgentPage } from "@/features/agent-metrics/components/agent-pages"

/** `/agente-catalogador`: Agente Catalogador — Visão geral (métricas) e Histórico. Ver aicontext/modules/agent-metrics.md. */
export default function AgenteCatalogadorPage() {
    return (
        <RepoIndexProvider enabled>
            <CatalogadorAgentPage />
        </RepoIndexProvider>
    )
}
