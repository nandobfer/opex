import { created } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { completeOpexFile } from "@/features/opex-agent/server/files"
import { loadMaddoxSettings } from "@/features/maddox-agent/server/settings"
import { requireClientActor } from "@/features/auth/server/context"
import { assertClientMaddoxEnabled } from "@/features/maddox-agent/server/client-config"
import { clientMaddoxScope } from "@/features/maddox-agent/server/sessions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/cliente/maddox/files/[id]/complete — confirma o envio. Idempotente. */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    const actor = await requireClientActor(req)
    await assertClientMaddoxEnabled(actor)
    const { settings } = await loadMaddoxSettings()
    return created(await completeOpexFile(params.id, settings.files, clientMaddoxScope(actor)))
})
