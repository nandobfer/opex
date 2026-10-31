import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { decideOpexActionSchema } from "@/features/opex-agent/schemas"
import { decideMaddoxPermission } from "@/features/maddox-agent/server/requests"
import { requireClientActor } from "@/features/auth/server/context"
import { assertClientMaddoxEnabled } from "@/features/maddox-agent/server/client-config"
import { clientMaddoxScope } from "@/features/maddox-agent/server/sessions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/cliente/maddox/actions/[id] — confirma ou cancela a permissão pedida pelo OpenCode. */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    const actor = await requireClientActor(req)
    await assertClientMaddoxEnabled(actor)
    const body = await parseBody(req, decideOpexActionSchema)
    if (!body.ok) return body.response
    return ok(await decideMaddoxPermission(params.id, body.data.decision, actor.userId, clientMaddoxScope(actor)))
})
