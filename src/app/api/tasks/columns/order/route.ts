import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { reorderColumnsSchema } from "@/features/tasks/schemas"
import { reorderColumns } from "@/features/tasks/server/columns"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** PUT /api/tasks/columns/order — nova ordem do quadro (as do Go! Sipal ficam na ordem do fluxo). */
export const PUT = withRoute(async ({ req }) => {
    const body = await parseBody(req, reorderColumnsSchema)
    if (!body.ok) return body.response
    return ok(await reorderColumns(body.data.order, getLocalUser().id))
})
