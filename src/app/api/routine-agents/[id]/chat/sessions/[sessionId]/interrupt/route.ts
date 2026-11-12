import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { interruptRoutineChat } from "@/features/routine-agents/server/chat/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/routine-agents/[id]/chat/sessions/[sessionId]/interrupt — para a resposta em andamento (OPE-160). */
export const POST = withRoute<{ id: string; sessionId: string }>(async ({ req, params }) => {
    await requireAdminSession(req)
    await interruptRoutineChat(params.id, params.sessionId)
    return ok({ id: params.sessionId })
})
