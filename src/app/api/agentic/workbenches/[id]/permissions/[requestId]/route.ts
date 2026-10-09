import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { permissionReplySchema } from "@/features/agentic/schemas"
import { replyPermission } from "@/features/agentic/server/workflow"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/agentic/workbenches/[id]/permissions/[requestId] — aprova (uma vez/sempre) ou recusa a ferramenta. */
export const POST = withRoute<{ id: string; requestId: string }>(async ({ req, params }) => {
    const body = await parseBody(req, permissionReplySchema)
    if (!body.ok) return body.response
    return ok(await replyPermission(params.id, params.requestId, body.data))
})
