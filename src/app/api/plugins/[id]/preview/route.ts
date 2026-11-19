import { parseBody, withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { pluginPreviewToggleSchema } from "@/features/plugins/schemas"
import { previewToggleResponse } from "@/features/plugins/server/http"
import { getPlugin } from "@/features/plugins/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/plugins/[id]/preview `{ on }` — liga/desliga a prévia do plugin neste navegador. */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    await requireAdminSession(req)
    const body = await parseBody(req, pluginPreviewToggleSchema)
    if (!body.ok) return body.response
    await getPlugin(params.id)
    return previewToggleResponse(req, params.id, body.data.on)
})
