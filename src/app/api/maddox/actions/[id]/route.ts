import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { decideOpexActionSchema } from "@/features/opex-agent/schemas"
import { decideMaddoxPermission } from "@/features/maddox-agent/server/requests"
import { MADDOX_OWNER_SCOPE } from "@/features/maddox-agent/server/sessions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/maddox/actions/[id] — confirma ou cancela a permissão pedida pelo OpenCode (o turno continua). */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    const body = await parseBody(req, decideOpexActionSchema)
    if (!body.ok) return body.response
    return ok(await decideMaddoxPermission(params.id, body.data.decision, getLocalUser().id, MADDOX_OWNER_SCOPE))
})
