import { created, ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { requireAdminSession } from "@/features/auth/server/context"
import { createOpexSessionSchema } from "@/features/opex-agent/schemas"
import { createRoutineChatSession, listRoutineChatSessions } from "@/features/routine-agents/server/chat/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/routine-agents/[id]/chat/sessions — conversas com o agente, da mais recente para a mais antiga (OPE-160). */
export const GET = withRoute<{ id: string }>(async ({ req, params }) => {
    await requireAdminSession(req)
    return ok(await listRoutineChatSessions(params.id))
})

/** POST — cria a conversa e, com `text`, já envia a primeira mensagem. 409 com o agente indisponível. */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    await requireAdminSession(req)
    const body = await parseBody(req, createOpexSessionSchema)
    if (!body.ok) return body.response
    return created(await createRoutineChatSession(params.id, body.data.text, getLocalUser().id))
})
