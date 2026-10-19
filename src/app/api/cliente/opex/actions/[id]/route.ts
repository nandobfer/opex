import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requireClientActor } from "@/features/auth/server/context"
import { decideOpexActionSchema } from "@/features/opex-agent/schemas"
import { assertClientOpexEnabled } from "@/features/opex-agent/server/client-config"
import { decideAction } from "@/features/opex-agent/server/confirmations"
import { clientOpexScope } from "@/features/opex-agent/server/scope"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/cliente/opex/actions/[id] — confirma (executa) ou cancela a ação pendente. */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    const actor = await requireClientActor(req)
    await assertClientOpexEnabled(actor)
    const body = await parseBody(req, decideOpexActionSchema)
    if (!body.ok) return body.response
    return ok(await decideAction(params.id, body.data.decision, actor.userId, clientOpexScope(actor)))
})
