import { created } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requireClientActor } from "@/features/auth/server/context"
import { reserveOpexFileSchema } from "@/features/opex-agent/schemas"
import { assertClientOpexEnabled } from "@/features/opex-agent/server/client-config"
import { reserveOpexFile } from "@/features/opex-agent/server/files"
import { loadOpexSettings } from "@/features/opex-agent/server/settings"
import { clientOpexScope } from "@/features/opex-agent/server/scope"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/cliente/opex/sessions/[id]/files — reserva o envio (URL assinada do PUT no storage). */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    const actor = await requireClientActor(req)
    await assertClientOpexEnabled(actor)
    const body = await parseBody(req, reserveOpexFileSchema)
    if (!body.ok) return body.response
    const { settings } = await loadOpexSettings()
    return created(await reserveOpexFile(params.id, body.data, settings.files, clientOpexScope(actor)))
})
