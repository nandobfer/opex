import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { requireAdminSession } from "@/features/auth/server/context"
import { pluginArchiveSchema } from "@/features/plugins/schemas"
import { setPluginArchived } from "@/features/plugins/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/plugins/[id]/archive — arquiva (desliga) ou desarquiva (volta desligado) o plugin. */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    await requireAdminSession(req)
    const body = await parseBody(req, pluginArchiveSchema)
    if (!body.ok) return body.response
    const result = await setPluginArchived(params.id, body.data.archived, getLocalUser().id)
    return ok({ archived: result.archived })
})
