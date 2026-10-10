import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { updateTaskEstimateSchema } from "@/features/tasks/schemas"
import { updateTaskEstimate } from "@/features/tasks/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** PATCH /api/tasks/[id]/estimate — edita as horas estimadas e recalcula o orçamento da tarefa. */
export const PATCH = withRoute<{ id: string }>(async ({ req, params }) => {
    const body = await parseBody(req, updateTaskEstimateSchema)
    if (!body.ok) return body.response
    return ok(await updateTaskEstimate(params.id, body.data, getLocalUser().id))
})
