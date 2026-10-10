import { created, ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { createTaskSchema } from "@/features/tasks/schemas"
import { listTasks } from "@/features/tasks/server/service"
import { createTaskWithIssue } from "@/features/github/server/task-issue"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/tasks?includeArchived=true — todas as tarefas (o Opex é a fonte de verdade). */
export const GET = withRoute(async ({ req }) => ok(await listTasks(req.nextUrl.searchParams.get("includeArchived") === "true")))

/** POST /api/tasks — cria a tarefa e a issue no GitHub vinculada (falha do GitHub bloqueia). */
export const POST = withRoute(async ({ req }) => {
    const body = await parseBody(req, createTaskSchema)
    if (!body.ok) return body.response
    return created(await createTaskWithIssue(body.data, getLocalUser().id))
})
