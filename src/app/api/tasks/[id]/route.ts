import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { runAfterResponse } from "@/lib/after-response"
import { updateTaskSchema } from "@/features/tasks/schemas"
import { deleteTask, getTask, updateTask } from "@/features/tasks/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/tasks/[id] — tarefa completa (comentários, histórico, horas). */
export const GET = withRoute<{ id: string }>(async ({ params }) => ok(await getTask(params.id)))

/** PATCH /api/tasks/[id] — edita título, descrição, especificação, tipo, prioridade, projeto ou coluna. */
export const PATCH = withRoute<{ id: string }>(async ({ req, params }) => {
    const body = await parseBody(req, updateTaskSchema)
    if (!body.ok) return body.response
    await updateTask(params.id, body.data, getLocalUser().id)
    // Título/descrição mudaram: o resumo de IA fica desatualizado e é regenerado em segundo plano.
    if (body.data.title !== undefined || body.data.description !== undefined) {
        runAfterResponse("task-summary", async () => {
            const { generateTaskSummary } = await import("@/features/ai/server/task-summary")
            await generateTaskSummary(params.id)
        })
    }
    return ok({ id: params.id })
})

/** DELETE /api/tasks/[id] — exclui a tarefa (com comentários e apontamentos). */
export const DELETE = withRoute<{ id: string }>(async ({ params }) => {
    await deleteTask(params.id, getLocalUser().id)
    return ok({ id: params.id })
})
