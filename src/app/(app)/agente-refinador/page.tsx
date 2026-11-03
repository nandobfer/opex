import { RepoIndexProvider } from "@/features/github/components/RepoIndexProvider"
import { RefinadorAgentPage } from "@/features/agent-metrics/components/agent-pages"

/** `/agente-refinador`: Agente Refinador — Visão geral (métricas) e Histórico. Ver aicontext/modules/agent-metrics.md. */
export default function AgenteRefinadorPage() {
    return (
        <RepoIndexProvider enabled>
            <RefinadorAgentPage />
        </RepoIndexProvider>
    )
}
