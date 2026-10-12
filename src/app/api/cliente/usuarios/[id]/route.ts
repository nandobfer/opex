import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { assertClientAdmin, requireClientActor } from "@/features/auth/server/context"
import { clienteUserSchema } from "@/features/orcamentos/schemas"
import { deleteClientUser, updateClientUser } from "@/features/orcamentos/server/users"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { id: string }

/** PATCH /api/cliente/usuarios/[id] — edita o usuário no cliente em escopo (admin do cliente). */
export const PATCH = withRoute<Params>(async ({ req, params }) => {
    const actor = await requireClientActor(req)
    assertClientAdmin(actor)
    const body = await parseBody(req, clienteUserSchema)
    if (!body.ok) return body.response
    return ok(await updateClientUser(actor.client, params.id, body.data, actor.userId, { owner: false }))
})

/** DELETE /api/cliente/usuarios/[id] — remove o vínculo do usuário com o cliente (admin do cliente). */
export const DELETE = withRoute<Params>(async ({ req, params }) => {
    const actor = await requireClientActor(req)
    assertClientAdmin(actor)
    await deleteClientUser(actor.client, params.id, actor.userId, { owner: false })
    return ok({ id: params.id })
})
