import type { Metadata } from "next"
import type { ReactNode } from "react"
import { redirect } from "next/navigation"
import { previewClientFromCookies, resolvePortalContext, sessionFromCookies } from "@/features/auth/server/context"
import { ClientePortalProvider, type ClientePortalSession } from "@/features/orcamentos/portal/ClientePortalContext"
import { ClientePortalShell } from "@/features/orcamentos/portal/ClientePortalShell"
import { loadClientOpexConfig } from "@/features/opex-agent/server/client-config"
import { loadClientMaddoxConfig } from "@/features/maddox-agent/server/client-config"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Portal do cliente", robots: { index: false, follow: false } }

/**
 * Layout autenticado do portal: exige sessão com cliente selecionado (usuário de cliente) ou a
 * pré-visualização do dono (cookie `opex_preview_client`). Sem contexto válido, volta para a entrada
 * `/cliente`.
 */
export default async function ClientePortalLayout({ children }: { children: ReactNode }) {
    const session = await sessionFromCookies()
    if (!session) redirect("/cliente")

    const previewClient = session.kind === "admin" ? await previewClientFromCookies() : null
    const context = await resolvePortalContext(session, previewClient)
    if (!context) redirect("/cliente")

    const [opex, maddox] = await Promise.all([loadClientOpexConfig(String(context.client._id)), loadClientMaddoxConfig(String(context.client._id))])
    const dto: ClientePortalSession = {
        clientId: String(context.client._id),
        clientName: context.client.name,
        isAdmin: context.isAdmin,
        preview: context.preview,
        user: { id: context.userId, username: context.username, email: context.email },
        clients: context.clients,
        opexEnabled: opex.enabled,
        maddoxEnabled: maddox.enabled,
    }

    return (
        <ClientePortalProvider session={dto}>
            <ClientePortalShell session={dto} version={process.env.APP_VERSION}>
                {children}
            </ClientePortalShell>
        </ClientePortalProvider>
    )
}
