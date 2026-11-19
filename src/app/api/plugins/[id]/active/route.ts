import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { requireAdminSession } from "@/features/auth/server/context"
import { pluginActiveSchema } from "@/features/plugins/schemas"
import { setPluginActive } from "@/features/plugins/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** PATCH /api/plugins/[id]/active — ativa ou desativa o plugin. */
export const PATCH = withRoute<{ id: string }>(async ({ req, params }) => {
    await requireAdminSession(req)
    const body = await parseBody(req, pluginActiveSchema)
    if (!body.ok) return body.response
    await setPluginActive(params.id, body.data.active, getLocalUser().id)
    return ok({ active: body.data.active })
})
