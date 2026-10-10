import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { moveTaskSchema } from "@/features/tasks/schemas"
import { moveTask } from "@/features/tasks/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/tasks/[id]/move — muda a coluna e/ou a posição da tarefa. */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    const body = await parseBody(req, moveTaskSchema)
    if (!body.ok) return body.response
    const task = await moveTask(params.id, body.data, getLocalUser().id)
    return ok(task)
})
