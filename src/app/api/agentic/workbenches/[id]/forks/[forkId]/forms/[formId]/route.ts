import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { formReplySchema } from "@/features/agentic/schemas"
import { replyForkForm } from "@/features/agentic/server/forks"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/agentic/workbenches/[id]/forks/[forkId]/forms/[formId] — responde (`answer`) ou dispensa (`cancel`) a pergunta do agente do fork. */
export const POST = withRoute<{ id: string; forkId: string; formId: string }>(async ({ req, params }) => {
    const body = await parseBody(req, formReplySchema)
    if (!body.ok) return body.response
    return ok(await replyForkForm(params.id, params.forkId, params.formId, body.data))
})
