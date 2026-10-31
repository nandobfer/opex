import { created } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { reserveOpexFileSchema } from "@/features/opex-agent/schemas"
import { reserveOpexFile } from "@/features/opex-agent/server/files"
import { loadMaddoxSettings } from "@/features/maddox-agent/server/settings"
import { MADDOX_OWNER_SCOPE } from "@/features/maddox-agent/server/sessions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/maddox/sessions/[id]/files — reserva o envio de um arquivo (URL assinada do PUT no storage). */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    const body = await parseBody(req, reserveOpexFileSchema)
    if (!body.ok) return body.response
    const { settings } = await loadMaddoxSettings()
    return created(await reserveOpexFile(params.id, body.data, settings.files, MADDOX_OWNER_SCOPE))
})
