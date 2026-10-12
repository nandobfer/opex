import { created, ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { getLocalUser } from "@/lib/local-user"
import { clienteUserSchema } from "@/features/orcamentos/schemas"
import { createClientUser, listClientUsers } from "@/features/orcamentos/server/users"
import { getClient } from "@/features/orcamentos/server/clients"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { id: string }

/** GET /api/integrations/orcamentos/clients/[id]/users — usuários do cliente (dono). */
export const GET = withRoute<Params>(async ({ req, params }) => {
    await requireAdminSession(req)
    return ok(await listClientUsers(await getClient(params.id)))
})

/** POST /api/integrations/orcamentos/clients/[id]/users — cria um usuário no cliente (dono). */
export const POST = withRoute<Params>(async ({ req, params }) => {
    await requireAdminSession(req)
    const body = await parseBody(req, clienteUserSchema)
    if (!body.ok) return body.response
    return created(await createClientUser(await getClient(params.id), body.data, getLocalUser().id))
})
