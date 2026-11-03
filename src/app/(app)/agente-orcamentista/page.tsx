import { RepoIndexProvider } from "@/features/github/components/RepoIndexProvider"
import { OrcamentistaAgentPage } from "@/features/agent-metrics/components/agent-pages"

/** `/agente-orcamentista`: Agente Orçamentista — Visão geral (métricas) e Histórico. Ver aicontext/modules/agent-metrics.md. */
export default function AgenteOrcamentistaPage() {
    return (
        <RepoIndexProvider enabled>
            <OrcamentistaAgentPage />
        </RepoIndexProvider>
    )
}
