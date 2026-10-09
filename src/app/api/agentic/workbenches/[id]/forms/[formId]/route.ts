import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { formReplySchema } from "@/features/agentic/schemas"
import { replyForm } from "@/features/agentic/server/workflow"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/agentic/workbenches/[id]/forms/[formId] — responde (`answer`) ou dispensa (`cancel`) a pergunta do agente. */
export const POST = withRoute<{ id: string; formId: string }>(async ({ req, params }) => {
    const body = await parseBody(req, formReplySchema)
    if (!body.ok) return body.response
    return ok(await replyForm(params.id, params.formId, body.data))
})
