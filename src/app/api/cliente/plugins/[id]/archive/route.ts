import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { assertClientAdmin, requireClientActor } from "@/features/auth/server/context"
import { pluginArchiveSchema } from "@/features/plugins/schemas"
import { setPluginArchived } from "@/features/plugins/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/cliente/plugins/[id]/archive — o admin do cliente arquiva ou desarquiva um plugin do portal. */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    const actor = await requireClientActor(req)
    assertClientAdmin(actor)
    const body = await parseBody(req, pluginArchiveSchema)
    if (!body.ok) return body.response
    const result = await setPluginArchived(params.id, body.data.archived, actor.userId, { kind: "client", clientId: String(actor.client._id) })
    return ok({ archived: result.archived })
})
