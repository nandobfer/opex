import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { bulkTasksSchema } from "@/features/tasks/schemas"
import { runBulkTasks } from "@/features/tasks/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/tasks/bulk — ações em lote (mover, atribuir, prioridade, arquivar); resultado por tarefa. */
export const POST = withRoute(async ({ req }) => {
    const body = await parseBody(req, bulkTasksSchema)
    if (!body.ok) return body.response
    return ok({ results: await runBulkTasks(body.data, getLocalUser().id) })
})
