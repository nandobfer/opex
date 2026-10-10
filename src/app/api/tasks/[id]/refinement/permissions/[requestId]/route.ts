import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { permissionReplySchema } from "@/features/agentic/schemas"
import { replyRefinementPermission } from "@/features/refinement/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/tasks/[id]/refinement/permissions/[requestId] — responde um pedido de permissão do agente. */
export const POST = withRoute<{ id: string; requestId: string }>(async ({ req, params }) => {
    const body = await parseBody(req, permissionReplySchema)
    if (!body.ok) return body.response
    return ok(await replyRefinementPermission(params.id, params.requestId, body.data))
})
