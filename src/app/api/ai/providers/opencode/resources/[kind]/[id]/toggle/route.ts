import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { resourceToggleSchema } from "@/features/opencode-resources/schemas"
import { idParam, uiActor } from "@/features/opencode-resources/server/route-params"
import { setResourceEnabled } from "@/features/opencode-resources/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST { enabled } — liga/desliga sem remover. */
export const POST = withRoute<{ kind: string; id: string }>(async ({ req, params }) => {
    const id = idParam(params.kind, params.id)
    const body = await parseBody(req, resourceToggleSchema)
    if (!body.ok) return body.response
    return ok(await setResourceEnabled(id, body.data.enabled, uiActor()))
})
