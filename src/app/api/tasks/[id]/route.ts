import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { updateTaskSchema } from "@/features/tasks/schemas"
import { getTask, updateTask } from "@/features/tasks/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/tasks/[id] — tarefa completa (comentários, histórico, horas). */
export const GET = withRoute<{ id: string }>(async ({ params }) => ok(await getTask(params.id)))

/** PATCH /api/tasks/[id] — responsável e/ou prioridade no Go! Sipal. */
export const PATCH = withRoute<{ id: string }>(async ({ req, params }) => {
    const body = await parseBody(req, updateTaskSchema)
    if (!body.ok) return body.response
    await updateTask(params.id, body.data, getLocalUser().id)
    return ok({ id: params.id })
})
