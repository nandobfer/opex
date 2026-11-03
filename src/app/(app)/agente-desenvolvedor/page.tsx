import { RepoIndexProvider } from "@/features/github/components/RepoIndexProvider"
import { DesenvolvedorAgentPage } from "@/features/agent-metrics/components/agent-pages"

/** `/agente-desenvolvedor`: Agente Desenvolvedor — Visão geral (métricas) e Histórico. Ver aicontext/modules/agent-metrics.md. */
export default function AgenteDesenvolvedorPage() {
    return (
        <RepoIndexProvider enabled>
            <DesenvolvedorAgentPage />
        </RepoIndexProvider>
    )
}
