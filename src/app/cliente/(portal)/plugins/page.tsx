import type { Metadata } from "next"
import { requirePortalAdminPage } from "@/features/auth/server/context"
import { ClientePluginsPage } from "@/features/plugins/components/PluginPages"

export const metadata: Metadata = { title: "Plugins · Portal", robots: { index: false, follow: false } }

/** Plugins do portal (OPE-172): restrito ao **admin** do cliente. */
export default async function Page() {
    await requirePortalAdminPage()
    return <ClientePluginsPage />
}
