import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { curatorRunSchema } from "@/features/engramind/schemas/migration"
import { runCurator } from "@/features/engramind/server/migration"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/engramind/migration/triage — roda o curador com o provedor e o modelo escolhidos (segundo plano). */
export const POST = withRoute(async ({ req }) => {
    const body = await parseBody(req, curatorRunSchema)
    if (!body.ok) return body.response
    return ok(await runCurator(body.data, getLocalUser().id))
})
