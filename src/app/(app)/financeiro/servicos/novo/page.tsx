import { RepoIndexProvider } from "@/features/github/components/RepoIndexProvider"
import { ServiceForm } from "@/features/services/components/ServiceForm"

/** Novo serviço: lançamento manual de faturamento (`/financeiro/servicos/novo`). */
export default function NovoServicoPage() {
    return (
        <RepoIndexProvider enabled>
            <ServiceForm />
        </RepoIndexProvider>
    )
}
