import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { allActiveClients, resolvePortalContext, sessionFromCookies, userClientsById } from "@/features/auth/server/context"
import { clienteDashboardPath, CLIENTE_TOKEN_PARAM } from "@/features/orcamentos/constants"
import { ClientePicker } from "@/features/orcamentos/portal/ClientePicker"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Portal", robots: { index: false, follow: false } }

/**
 * Entrada do portal (`/cliente`). Três caminhos:
 * 1. `?t=…` (URL com token): redireciona para o handler que troca o token por sessão;
 * 2. sessão de **cliente** com cliente selecionado: entra direto no dashboard; sem cliente (ou
 *    vários), mostra a lista para escolher;
 * 3. sessão do **dono**: mostra a lista para escolher qual cliente pré-visualizar.
 */
export default async function ClienteEntryPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
    const { t } = await searchParams
    if (t) redirect(`/api/auth/client-login?${CLIENTE_TOKEN_PARAM}=${encodeURIComponent(t)}`)

    const session = await sessionFromCookies()
    if (!session) redirect("/login")

    if (session.kind === "admin") {
        const clients = await allActiveClients()
        return (
            <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
                <ClientePicker clients={clients} mode="preview" />
            </main>
        )
    }

    const context = await resolvePortalContext(session)
    if (context) redirect(clienteDashboardPath())

    const clients = await userClientsById(session.userId!)
    return (
        <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
            <ClientePicker clients={clients} mode="client" />
        </main>
    )
}
