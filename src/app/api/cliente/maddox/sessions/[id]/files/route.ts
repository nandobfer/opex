import { created } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { reserveOpexFileSchema } from "@/features/opex-agent/schemas"
import { reserveOpexFile } from "@/features/opex-agent/server/files"
import { loadMaddoxSettings } from "@/features/maddox-agent/server/settings"
import { requireClientActor } from "@/features/auth/server/context"
import { assertClientMaddoxEnabled } from "@/features/maddox-agent/server/client-config"
import { clientMaddoxScope } from "@/features/maddox-agent/server/sessions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/cliente/maddox/sessions/[id]/files — reserva o envio (URL assinada do PUT). */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    const actor = await requireClientActor(req)
    await assertClientMaddoxEnabled(actor)
    const body = await parseBody(req, reserveOpexFileSchema)
    if (!body.ok) return body.response
    const { settings } = await loadMaddoxSettings()
    return created(await reserveOpexFile(params.id, body.data, settings.files, clientMaddoxScope(actor)))
})
