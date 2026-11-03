import { RepoIndexProvider } from "@/features/github/components/RepoIndexProvider"
import { ArquitetoAgentPage } from "@/features/agent-metrics/components/agent-pages"

/** `/agente-arquiteto`: Agente Arquiteto — Visão geral (métricas) e Histórico. Ver aicontext/modules/agent-metrics.md. */
export default function AgenteArquitetoPage() {
    return (
        <RepoIndexProvider enabled>
            <ArquitetoAgentPage />
        </RepoIndexProvider>
    )
}
