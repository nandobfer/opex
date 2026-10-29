import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requireClientActor } from "@/features/auth/server/context"
import { portalEnvironmentActionSchema } from "@/features/environments/schemas"
import { runPortalEnvironmentAction } from "@/features/environments/server/portal"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { id: string }

/**
 * POST /api/cliente/ambientes/[id]/actions — `{ action: "deploy" | "up" | "restart" }` (admin do
 * cliente). O deploy usa a ref salva do ambiente e segue em segundo plano (`{ started: true }`).
 */
export const POST = withRoute<Params>(async ({ req, params }) => {
    const actor = await requireClientActor(req)
    const body = await parseBody(req, portalEnvironmentActionSchema)
    if (!body.ok) return body.response
    return ok(await runPortalEnvironmentAction(actor, params.id, body.data.action))
})
