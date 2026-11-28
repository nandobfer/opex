import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { permissionReplySchema } from "@/features/agentic/schemas"
import { replyProjectBootstrapPermission } from "@/features/project-bootstrap/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/project-bootstraps/[id]/permissions/[requestId] — responde um pedido de permissão do agente. */
export const POST = withRoute<{ id: string; requestId: string }>(async ({ req, params }) => {
    const body = await parseBody(req, permissionReplySchema)
    if (!body.ok) return body.response
    return ok(await replyProjectBootstrapPermission(params.id, params.requestId, body.data))
})
