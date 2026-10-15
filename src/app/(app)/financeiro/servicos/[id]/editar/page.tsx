import { RepoIndexProvider } from "@/features/github/components/RepoIndexProvider"
import { ServiceEditPage } from "@/features/services/components/ServiceEditPage"

/** Editar serviço (`/financeiro/servicos/[id]/editar`). */
export default async function EditarServicoPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    return (
        <RepoIndexProvider enabled>
            <ServiceEditPage id={id} />
        </RepoIndexProvider>
    )
}
