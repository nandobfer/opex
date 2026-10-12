import type { Metadata } from "next"
import { ClienteNovaTarefaPage } from "@/features/orcamentos/portal/ClienteNovaTarefaPage"

export const metadata: Metadata = { title: "Nova tarefa · Portal", robots: { index: false, follow: false } }

export default function Page() {
    return <ClienteNovaTarefaPage />
}
