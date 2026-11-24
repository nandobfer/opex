import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { builderActionSchema } from "@/features/environments/schemas"
import { runBuilderAction } from "@/features/environments/server/builder"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/environments/builder/actions — criar, levantar, derrubar, recriar ou apagar o builder do servidor. */
export const POST = withRoute(async ({ req }) => {
    const body = await parseBody(req, builderActionSchema)
    if (!body.ok) return body.response
    return ok(await runBuilderAction(body.data, getLocalUser().id))
})
