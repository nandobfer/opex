import { created } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { requireAdminSession } from "@/features/auth/server/context"
import { sendOpexMessageSchema } from "@/features/opex-agent/schemas"
import { sendRoutineChatMessage } from "@/features/routine-agents/server/chat/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/routine-agents/[id]/chat/sessions/[sessionId]/messages — grava a mensagem e inicia o turno
 * (a resposta chega pelo stream). Não é execução do agente (OPE-160). 409 com a conversa ocupada ou o
 * agente indisponível; anexos são recusados (400).
 */
export const POST = withRoute<{ id: string; sessionId: string }>(async ({ req, params }) => {
    await requireAdminSession(req)
    const body = await parseBody(req, sendOpexMessageSchema)
    if (!body.ok) return body.response
    return created(await sendRoutineChatMessage(params.id, params.sessionId, body.data, getLocalUser().id))
})
