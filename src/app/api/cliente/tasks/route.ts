import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { listClientTasks } from "@/features/orcamentos/server/portal"
import { requireClient } from "@/features/orcamentos/server/token"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/cliente/tasks?includeArchived= — tarefas dos repositórios do cliente. */
export const GET = withRoute(async ({ req }) => {
    const client = await requireClient(req)
    const includeArchived = new URL(req.url).searchParams.get("includeArchived") === "true"
    return ok(await listClientTasks(client, includeArchived))
})
