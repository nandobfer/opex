import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { requireAdminSession } from "@/features/auth/server/context"
import { instanceOptionsSchema } from "@/features/evolution-api/schemas"
import { getInstanceOptions, saveInstanceOptions } from "@/features/evolution-api/server/instances"
import { instanceParam } from "@/features/evolution-api/server/params"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/evolution/instances/[name]/options — opções da instância (`readMessages` sempre desligada). */
export const GET = withRoute<{ name: string }>(async ({ req, params }) => {
    await requireAdminSession(req)
    return ok(await getInstanceOptions(instanceParam(params.name)))
})

/** PUT /api/evolution/instances/[name]/options — grava as opções. */
export const PUT = withRoute<{ name: string }>(async ({ req, params }) => {
    await requireAdminSession(req)
    const body = await parseBody(req, instanceOptionsSchema)
    if (!body.ok) return body.response
    return ok(await saveInstanceOptions(instanceParam(params.name), body.data, getLocalUser().id))
})
