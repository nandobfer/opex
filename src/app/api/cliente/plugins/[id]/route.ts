import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { assertClientAdmin, requireClientActor } from "@/features/auth/server/context"
import { getPlugin } from "@/features/plugins/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/cliente/plugins/[id] — plugin do cliente com as versões (admin). */
export const GET = withRoute<{ id: string }>(async ({ req, params }) => {
    const actor = await requireClientActor(req)
    assertClientAdmin(actor)
    return ok(await getPlugin(params.id, { kind: "client", clientId: String(actor.client._id) }))
})
