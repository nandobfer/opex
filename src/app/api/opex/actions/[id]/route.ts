import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { decideOpexActionSchema } from "@/features/opex-agent/schemas"
import { decideAction } from "@/features/opex-agent/server/confirmations"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/opex/actions/[id] — confirma (executa) ou cancela a ação pendente do agente. A decisão
 * volta para a sessão e o agente continua sozinho. 409 `OPEX_ACTION_DECIDED`/`OPEX_ACTION_EXPIRED`.
 */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    const body = await parseBody(req, decideOpexActionSchema)
    if (!body.ok) return body.response
    return ok(await decideAction(params.id, body.data.decision, getLocalUser().id))
})
