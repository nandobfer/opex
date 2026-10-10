import { created, ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { createTaskSchema } from "@/features/tasks/schemas"
import { createTask, listTasks } from "@/features/tasks/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/tasks?includeArchived=true — todas as tarefas (o Opex é a fonte de verdade). */
export const GET = withRoute(async ({ req }) => ok(await listTasks(req.nextUrl.searchParams.get("includeArchived") === "true")))

/** POST /api/tasks — cria uma tarefa. */
export const POST = withRoute(async ({ req }) => {
    const body = await parseBody(req, createTaskSchema)
    if (!body.ok) return body.response
    return created(await createTask(body.data, { actorId: getLocalUser().id }))
})
