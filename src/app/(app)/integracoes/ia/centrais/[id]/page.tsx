import { CentralPage } from "@/features/agentic/components/central/CentralPage"

/** Configurações de uma central de desenvolvimento (Provedores de IA › Desenvolvimento agêntico). */
export default async function CentralDesenvolvimentoPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    return <CentralPage id={id} />
}
