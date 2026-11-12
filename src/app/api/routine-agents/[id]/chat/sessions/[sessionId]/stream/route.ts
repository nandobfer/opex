import { withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { openRoutineChatStream } from "@/features/routine-agents/server/chat/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/routine-agents/[id]/chat/sessions/[sessionId]/stream — NDJSON: `snapshot` + resposta ao vivo (OPE-160). */
export const GET = withRoute<{ id: string; sessionId: string }>(async ({ req, params }) => {
    await requireAdminSession(req)
    return openRoutineChatStream(params.id, params.sessionId, req.signal)
})
