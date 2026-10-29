import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requireClientActor } from "@/features/auth/server/context"
import { listPortalEnvironments } from "@/features/environments/server/portal"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/cliente/ambientes — ambientes dos repositórios vinculados ao cliente (visão reduzida). */
export const GET = withRoute(async ({ req }) => {
    const actor = await requireClientActor(req)
    return ok(await listPortalEnvironments(actor.client))
})
