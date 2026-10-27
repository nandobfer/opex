import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { liveMessageSchema } from "@/features/agentic/schemas"
import { sendRefinementMessage } from "@/features/refinement/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/tasks/[id]/refinement/messages `{ text }` — chat durante a execução: a mensagem entra no
 * turno de refinamento em andamento (sem interromper). 409 com a opção desligada, sem o agente
 * trabalhando ou durante a consolidação da especificação.
 */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    const body = await parseBody(req, liveMessageSchema)
    if (!body.ok) return body.response
    return ok(await sendRefinementMessage(params.id, body.data.text))
})
