import { created } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { adoptInputSchema } from "@/features/environments/schemas"
import { adoptProject, getEnvironment } from "@/features/environments/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/environments/adopt — adota um projeto do compose descoberto (com ou sem git). */
export const POST = withRoute(async ({ req }) => {
    const body = await parseBody(req, adoptInputSchema)
    if (!body.ok) return body.response
    const env = await adoptProject(body.data, getLocalUser().id)
    return created(await getEnvironment(String(env._id)))
})
