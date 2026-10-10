import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { updateTimeLogSchema } from "@/features/time/schemas"
import { deleteTimeLog, updateTimeLog } from "@/features/time/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** PATCH /api/time/[id] — descrição, ou período. */
export const PATCH = withRoute<{ id: string }>(async ({ req, params }) => {
    const body = await parseBody(req, updateTimeLogSchema)
    if (!body.ok) return body.response
    await updateTimeLog(params.id, body.data, getLocalUser().id)
    return ok({ id: params.id })
})

/** DELETE /api/time/[id] — exclui o apontamento. */
export const DELETE = withRoute<{ id: string }>(async ({ params }) => {
    await deleteTimeLog(params.id, getLocalUser().id)
    return ok({ id: params.id })
})
