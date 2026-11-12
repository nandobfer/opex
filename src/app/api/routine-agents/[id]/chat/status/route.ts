import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { routineChatStatus } from "@/features/routine-agents/server/chat/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/routine-agents/[id]/chat/status — se dá para conversar com o agente (e por que não) e o modelo (OPE-160). */
export const GET = withRoute<{ id: string }>(async ({ req, params }) => {
    await requireAdminSession(req)
    return ok(await routineChatStatus(params.id))
})
