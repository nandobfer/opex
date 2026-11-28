import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { formReplySchema } from "@/features/agentic/schemas"
import { replyProjectBootstrapForm } from "@/features/project-bootstrap/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/project-bootstraps/[id]/forms/[formId] — responde ou dispensa a pergunta do agente. */
export const POST = withRoute<{ id: string; formId: string }>(async ({ req, params }) => {
    const body = await parseBody(req, formReplySchema)
    if (!body.ok) return body.response
    return ok(await replyProjectBootstrapForm(params.id, params.formId, body.data))
})
