import type { Metadata } from "next"
import { ClienteTasksPage } from "@/features/orcamentos/portal/ClienteTasksPage"

export const metadata: Metadata = { title: "Tarefas · Portal", robots: { index: false, follow: false } }

export default function Page() {
    return <ClienteTasksPage />
}
