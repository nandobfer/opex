import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { assertClientAdmin, requireClientActor } from "@/features/auth/server/context"
import { listPlugins } from "@/features/plugins/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/cliente/plugins — plugins do cliente da sessão (só o admin do cliente; OPE-172). */
export const GET = withRoute(async ({ req }) => {
    const actor = await requireClientActor(req)
    assertClientAdmin(actor)
    return ok(await listPlugins({ kind: "client", clientId: String(actor.client._id) }))
})
