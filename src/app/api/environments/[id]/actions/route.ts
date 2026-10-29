import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { environmentActionSchema } from "@/features/environments/schemas"
import { runEnvironmentAction } from "@/features/environments/server/deploy"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/environments/[id]/actions — deploy/move (devolvem o id do deploy) ou up/down/restart/logs. */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    const body = await parseBody(req, environmentActionSchema)
    if (!body.ok) return body.response
    return ok(await runEnvironmentAction(params.id, body.data, getLocalUser().id))
})
