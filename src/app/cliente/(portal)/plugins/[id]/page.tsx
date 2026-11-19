import type { Metadata } from "next"
import { requirePortalAdminPage } from "@/features/auth/server/context"
import { ClientePluginDetailPage } from "@/features/plugins/components/PluginPages"

export const metadata: Metadata = { title: "Plugin · Portal", robots: { index: false, follow: false } }

/** Detalhe de um plugin do cliente: prévia, aprovação, versões e rollback (admin). */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
    await requirePortalAdminPage()
    const { id } = await params
    return <ClientePluginDetailPage id={id} />
}
