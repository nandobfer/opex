import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { deleteTimeLogSchema, updateTimeLogSchema } from "@/features/time/schemas"
import { deleteTimeLog, updateTimeLog } from "@/features/time/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** PATCH /api/time/[id] — descrição, ou período com justificativa. */
export const PATCH = withRoute<{ id: string }>(async ({ req, params }) => {
    const body = await parseBody(req, updateTimeLogSchema)
    if (!body.ok) return body.response
    await updateTimeLog(params.id, body.data, getLocalUser().id)
    return ok({ id: params.id })
})

/** DELETE /api/time/[id] — exclui o apontamento no Go! Sipal (justificativa obrigatória). */
export const DELETE = withRoute<{ id: string }>(async ({ req, params }) => {
    const body = await parseBody(req, deleteTimeLogSchema)
    if (!body.ok) return body.response
    await deleteTimeLog(params.id, body.data.justification, getLocalUser().id)
    return ok({ id: params.id })
})
