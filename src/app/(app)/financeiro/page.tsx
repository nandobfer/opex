import { RepoIndexProvider } from "@/features/github/components/RepoIndexProvider"
import { FinancePage } from "@/features/finance/components/FinancePage"

/** Financeiro: faturamento das tarefas concluídas por cliente (somente leitura). */
export default function FinanceiroPage() {
    return (
        <RepoIndexProvider enabled>
            <FinancePage />
        </RepoIndexProvider>
    )
}
