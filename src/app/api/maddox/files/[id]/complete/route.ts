import { created } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { completeOpexFile } from "@/features/opex-agent/server/files"
import { loadMaddoxSettings } from "@/features/maddox-agent/server/settings"
import { MADDOX_OWNER_SCOPE } from "@/features/maddox-agent/server/sessions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/maddox/files/[id]/complete — confirma o envio (HeadObject + tamanho). Idempotente. */
export const POST = withRoute<{ id: string }>(async ({ params }) => {
    const { settings } = await loadMaddoxSettings()
    return created(await completeOpexFile(params.id, settings.files, MADDOX_OWNER_SCOPE))
})
