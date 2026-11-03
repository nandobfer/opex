import { RepoIndexProvider } from "@/features/github/components/RepoIndexProvider"
import { OpexAgentMetricsPage } from "@/features/agent-metrics/components/agent-pages"

/** `/agente-opex`: Agente Opex — Visão geral (métricas) e Histórico. Ver aicontext/modules/agent-metrics.md. */
export default function AgenteOpexPage() {
    return (
        <RepoIndexProvider enabled>
            <OpexAgentMetricsPage />
        </RepoIndexProvider>
    )
}
