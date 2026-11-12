import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { requireAdminSession } from "@/features/auth/server/context"
import { decideOpexActionSchema } from "@/features/opex-agent/schemas"
import { decideRoutineChatAction } from "@/features/routine-agents/server/chat/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/routine-agents/[id]/chat/actions/[actionId] — confirma (executa, se a ferramenta ainda estiver
 * liberada ao agente) ou cancela a ação pendente da conversa (OPE-160). A decisão volta para a conversa.
 */
export const POST = withRoute<{ id: string; actionId: string }>(async ({ req, params }) => {
    await requireAdminSession(req)
    const body = await parseBody(req, decideOpexActionSchema)
    if (!body.ok) return body.response
    return ok(await decideRoutineChatAction(params.id, params.actionId, body.data.decision, getLocalUser().id))
})
