import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { setTaskClientSchema } from "@/features/tasks/schemas"
import { setTaskClient } from "@/features/tasks/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** PATCH /api/tasks/[id]/client — define, troca ou remove (`null`) o cliente da tarefa. */
export const PATCH = withRoute<{ id: string }>(async ({ req, params }) => {
    const body = await parseBody(req, setTaskClientSchema)
    if (!body.ok) return body.response
    return ok(await setTaskClient(params.id, body.data.clientId, getLocalUser().id))
})
