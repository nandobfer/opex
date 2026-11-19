import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { assertClientAdmin, requireClientActor } from "@/features/auth/server/context"
import { pluginActiveSchema } from "@/features/plugins/schemas"
import { setPluginActive } from "@/features/plugins/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** PATCH /api/cliente/plugins/[id]/active — o admin do cliente ativa ou desativa um plugin do portal. */
export const PATCH = withRoute<{ id: string }>(async ({ req, params }) => {
    const actor = await requireClientActor(req)
    assertClientAdmin(actor)
    const body = await parseBody(req, pluginActiveSchema)
    if (!body.ok) return body.response
    await setPluginActive(params.id, body.data.active, actor.userId, { kind: "client", clientId: String(actor.client._id) })
    return ok({ active: body.data.active })
})
