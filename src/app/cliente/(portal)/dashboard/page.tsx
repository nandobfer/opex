import type { Metadata } from "next"
import { ClienteDashboardPage } from "@/features/orcamentos/portal/ClienteDashboardPage"

export const metadata: Metadata = { title: "Dashboard · Portal", robots: { index: false, follow: false } }

export default function Page() {
    return <ClienteDashboardPage />
}
