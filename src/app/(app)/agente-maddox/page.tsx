import { RepoIndexProvider } from "@/features/github/components/RepoIndexProvider"
import { MaddoxAgentMetricsPage } from "@/features/agent-metrics/components/agent-pages"

/** `/agente-maddox`: Agente Maddox — Visão geral (métricas) e Histórico. Ver aicontext/modules/agent-metrics.md. */
export default function AgenteMaddoxPage() {
    return (
        <RepoIndexProvider enabled>
            <MaddoxAgentMetricsPage />
        </RepoIndexProvider>
    )
}
