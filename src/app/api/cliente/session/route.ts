import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { actorClients, requireClientActor } from "@/features/auth/server/context"
import type { ClienteSessionDto } from "@/features/orcamentos/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/cliente/session — cliente selecionado, usuário logado, papel e clientes do usuário. */
export const GET = withRoute(async ({ req }) => {
    const actor = await requireClientActor(req)
    const clients = await actorClients(actor)
    const dto: ClienteSessionDto = {
        clientId: String(actor.client._id),
        clientName: actor.client.name,
        isAdmin: actor.isAdmin,
        user: { id: actor.userId, username: actor.username, email: actor.email },
        clients,
    }
    return ok(dto)
})
