import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { getLocalUser } from "@/lib/local-user"
import { clienteUserSchema } from "@/features/orcamentos/schemas"
import { deleteClientUser, updateClientUser } from "@/features/orcamentos/server/users"
import { getClient } from "@/features/orcamentos/server/clients"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { id: string; userId: string }

/** PATCH /api/integrations/orcamentos/clients/[id]/users/[userId] — edita o usuário (dono). */
export const PATCH = withRoute<Params>(async ({ req, params }) => {
    await requireAdminSession(req)
    const body = await parseBody(req, clienteUserSchema)
    if (!body.ok) return body.response
    return ok(await updateClientUser(await getClient(params.id), params.userId, body.data, getLocalUser().id, { owner: true }))
})

/** DELETE /api/integrations/orcamentos/clients/[id]/users/[userId] — remove o vínculo (dono). */
export const DELETE = withRoute<Params>(async ({ req, params }) => {
    await requireAdminSession(req)
    await deleteClientUser(await getClient(params.id), params.userId, getLocalUser().id, { owner: true })
    return ok({ id: params.userId })
})
