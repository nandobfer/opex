import { RepoIndexProvider } from "@/features/github/components/RepoIndexProvider"
import { ServiceDetailPage } from "@/features/services/components/ServiceDetailPage"

/** Detalhe de um serviço (`/financeiro/servicos/[id]`). */
export default async function ServicoPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    return (
        <RepoIndexProvider enabled>
            <ServiceDetailPage id={id} />
        </RepoIndexProvider>
    )
}
