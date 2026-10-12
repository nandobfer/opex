import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { getLocalUser } from "@/lib/local-user"
import { regenerateClientUserToken } from "@/features/orcamentos/server/users"
import { getClient } from "@/features/orcamentos/server/clients"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { id: string; userId: string }

/** POST /api/integrations/orcamentos/clients/[id]/users/[userId]/token — regenera o token (dono). */
export const POST = withRoute<Params>(async ({ req, params }) => {
    await requireAdminSession(req)
    return ok(await regenerateClientUserToken(await getClient(params.id), params.userId, getLocalUser().id, { owner: true }))
})
