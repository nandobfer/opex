import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { getSessionTranscript } from "@/features/opex-agent/server/sessions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/agents/conversations/[id] — conversa do Opex ou do Maddox (dono ou portal), só leitura, para o dono. */
export const GET = withRoute<{ id: string }>(async ({ req, params }) => {
    await requireAdminSession(req)
    return ok(await getSessionTranscript(params.id))
})
