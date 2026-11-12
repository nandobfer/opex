import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { requireAdminSession } from "@/features/auth/server/context"
import { updateOpexSessionSchema } from "@/features/opex-agent/schemas"
import { deleteRoutineChatSession, getRoutineChatSession, updateRoutineChatSession } from "@/features/routine-agents/server/chat/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { id: string; sessionId: string }

/** GET /api/routine-agents/[id]/chat/sessions/[sessionId] — conversa com as mensagens gravadas (OPE-160). */
export const GET = withRoute<Params>(async ({ req, params }) => {
    await requireAdminSession(req)
    return ok(await getRoutineChatSession(params.id, params.sessionId))
})

/** PATCH — renomeia ou arquiva. */
export const PATCH = withRoute<Params>(async ({ req, params }) => {
    await requireAdminSession(req)
    const body = await parseBody(req, updateOpexSessionSchema)
    if (!body.ok) return body.response
    return ok(await updateRoutineChatSession(params.id, params.sessionId, body.data, getLocalUser().id))
})

/** DELETE — exclui a conversa, as mensagens e as ações pendentes. */
export const DELETE = withRoute<Params>(async ({ req, params }) => {
    await requireAdminSession(req)
    await deleteRoutineChatSession(params.id, params.sessionId, getLocalUser().id)
    return ok({ id: params.sessionId })
})
