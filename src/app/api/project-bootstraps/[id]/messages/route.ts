import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { projectBootstrapMessageSchema } from "@/features/project-bootstrap/schemas"
import { sendProjectBootstrapMessage } from "@/features/project-bootstrap/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/project-bootstraps/[id]/messages — mensagem do dono ao Agente de Bootstrap. */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    const body = await parseBody(req, projectBootstrapMessageSchema)
    if (!body.ok) return body.response
    return ok(await sendProjectBootstrapMessage(params.id, body.data.text, getLocalUser().id))
})
