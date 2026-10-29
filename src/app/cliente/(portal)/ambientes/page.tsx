import type { Metadata } from "next"
import { ClienteAmbientesPage } from "@/features/environments/portal/ClienteAmbientesPage"

export const metadata: Metadata = { title: "Ambientes · Portal", robots: { index: false, follow: false } }

/** Ambientes do portal: todos os usuários veem o estado; implantar/levantar/reiniciar é do admin. */
export default function Page() {
    return <ClienteAmbientesPage />
}
