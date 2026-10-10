import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { formReplySchema } from "@/features/agentic/schemas"
import { replyRefinementForm } from "@/features/refinement/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/tasks/[id]/refinement/forms/[formId] — responde (`answer`) ou dispensa (`cancel`) a pergunta. */
export const POST = withRoute<{ id: string; formId: string }>(async ({ req, params }) => {
    const body = await parseBody(req, formReplySchema)
    if (!body.ok) return body.response
    return ok(await replyRefinementForm(params.id, params.formId, body.data))
})
