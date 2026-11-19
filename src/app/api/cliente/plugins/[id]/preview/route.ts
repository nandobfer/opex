import { parseBody, withRoute } from "@/lib/api/route"
import { assertClientAdmin, requireClientActor } from "@/features/auth/server/context"
import { pluginPreviewToggleSchema } from "@/features/plugins/schemas"
import { previewToggleResponse } from "@/features/plugins/server/http"
import { getPlugin } from "@/features/plugins/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/cliente/plugins/[id]/preview `{ on }` — o admin liga/desliga a prévia neste navegador. */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    const actor = await requireClientActor(req)
    assertClientAdmin(actor)
    const body = await parseBody(req, pluginPreviewToggleSchema)
    if (!body.ok) return body.response
    await getPlugin(params.id, { kind: "client", clientId: String(actor.client._id) })
    return previewToggleResponse(req, params.id, body.data.on)
})
