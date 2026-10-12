import { created, ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { assertClientAdmin, requireClientActor } from "@/features/auth/server/context"
import { clienteUserSchema } from "@/features/orcamentos/schemas"
import { createClientUser, listClientUsers } from "@/features/orcamentos/server/users"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/cliente/usuarios — usuários do cliente em escopo (admin do cliente). */
export const GET = withRoute(async ({ req }) => {
    const actor = await requireClientActor(req)
    assertClientAdmin(actor)
    return ok(await listClientUsers(actor.client))
})

/** POST /api/cliente/usuarios — cria um usuário no cliente em escopo (admin do cliente). */
export const POST = withRoute(async ({ req }) => {
    const actor = await requireClientActor(req)
    assertClientAdmin(actor)
    const body = await parseBody(req, clienteUserSchema)
    if (!body.ok) return body.response
    return created(await createClientUser(actor.client, body.data, actor.userId))
})
