import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requireClientActor } from "@/features/auth/server/context"
import { getClientOptions } from "@/features/orcamentos/server/portal"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/cliente/options — nome do cliente e repositórios permitidos (portal). */
export const GET = withRoute(async ({ req }) => {
    const actor = await requireClientActor(req)
    return ok(await getClientOptions(actor.client))
})
