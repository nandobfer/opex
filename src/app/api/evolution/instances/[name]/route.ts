import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { requireAdminSession } from "@/features/auth/server/context"
import { getInstance, runInstanceAction } from "@/features/evolution-api/server/instances"
import { instanceParam } from "@/features/evolution-api/server/params"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/evolution/instances/[name] — estado ao vivo, QR/código e perfil. */
export const GET = withRoute<{ name: string }>(async ({ req, params }) => {
    await requireAdminSession(req)
    return ok(await getInstance(instanceParam(params.name)))
})

/** DELETE /api/evolution/instances/[name] — exclui a instância na Evolution. */
export const DELETE = withRoute<{ name: string }>(async ({ req, params }) => {
    await requireAdminSession(req)
    return ok(await runInstanceAction(instanceParam(params.name), "delete", getLocalUser().id))
})
