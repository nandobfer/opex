import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { assertClientAdmin, requireClientActor } from "@/features/auth/server/context"
import { pluginRollbackSchema } from "@/features/plugins/schemas"
import { rollbackPlugin } from "@/features/plugins/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/cliente/plugins/[id]/rollback — o admin do cliente volta o plugin para uma versão anterior. */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    const actor = await requireClientActor(req)
    assertClientAdmin(actor)
    const body = await parseBody(req, pluginRollbackSchema)
    if (!body.ok) return body.response
    return ok(await rollbackPlugin(params.id, body.data.versionId, actor.userId, { kind: "client", clientId: String(actor.client._id) }))
})
