import type { Metadata } from "next"
import { requirePortalAdminPage } from "@/features/auth/server/context"
import { ClienteUsuariosPage } from "@/features/orcamentos/portal/ClienteUsuariosPage"

export const metadata: Metadata = { title: "Usuários · Portal", robots: { index: false, follow: false } }

/** Usuários do portal: restrito ao **admin** do cliente (senão, volta para o dashboard). */
export default async function Page() {
    await requirePortalAdminPage()
    return <ClienteUsuariosPage />
}
