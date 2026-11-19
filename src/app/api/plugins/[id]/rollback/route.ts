import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { requireAdminSession } from "@/features/auth/server/context"
import { pluginRollbackSchema } from "@/features/plugins/schemas"
import { rollbackPlugin } from "@/features/plugins/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/plugins/[id]/rollback — volta a stable para uma versão consolidada antes (troca ao vivo). */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    await requireAdminSession(req)
    const body = await parseBody(req, pluginRollbackSchema)
    if (!body.ok) return body.response
    return ok(await rollbackPlugin(params.id, body.data.versionId, getLocalUser().id))
})
