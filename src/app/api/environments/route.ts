import { created, ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { environmentInputSchema } from "@/features/environments/schemas"
import { createEnvironment, getEnvironment, listEnvironments } from "@/features/environments/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/environments — ambientes (com o estado dos serviços), não gerenciados e se o PC está alcançável. */
export const GET = withRoute(async () => {
    return ok(await listEnvironments())
})

/** POST /api/environments — cria um ambiente (sem implantar). */
export const POST = withRoute(async ({ req }) => {
    const body = await parseBody(req, environmentInputSchema)
    if (!body.ok) return body.response
    const env = await createEnvironment(body.data, getLocalUser().id)
    return created(await getEnvironment(String(env._id)))
})
