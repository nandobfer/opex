import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { assertClientAdmin, requireClientActor } from "@/features/auth/server/context"
import { regenerateClientUserToken } from "@/features/orcamentos/server/users"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { id: string }

/** POST /api/cliente/usuarios/[id]/token — regenera o token próprio do usuário (admin do cliente). */
export const POST = withRoute<Params>(async ({ req, params }) => {
    const actor = await requireClientActor(req)
    assertClientAdmin(actor)
    return ok(await regenerateClientUserToken(actor.client, params.id, actor.userId, { owner: false }))
})
