import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { liveMessageSchema } from "@/features/agentic/schemas"
import { sendLiveMessage } from "@/features/agentic/server/workflow"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/agentic/workbenches/[id]/messages `{ text }` — chat durante a execução: a mensagem entra no
 * turno em andamento da mesa (sem interromper). 409 com a opção desligada ou sem o agente trabalhando.
 */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    const body = await parseBody(req, liveMessageSchema)
    if (!body.ok) return body.response
    return ok(await sendLiveMessage(params.id, body.data.text))
})
