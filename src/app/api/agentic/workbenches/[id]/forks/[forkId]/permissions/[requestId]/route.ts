import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { permissionReplySchema } from "@/features/agentic/schemas"
import { replyForkPermission } from "@/features/agentic/server/forks"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/agentic/workbenches/[id]/forks/[forkId]/permissions/[requestId] — responde um pedido de permissão do agente do fork. */
export const POST = withRoute<{ id: string; forkId: string; requestId: string }>(async ({ req, params }) => {
    const body = await parseBody(req, permissionReplySchema)
    if (!body.ok) return body.response
    return ok(await replyForkPermission(params.id, params.forkId, params.requestId, body.data))
})
