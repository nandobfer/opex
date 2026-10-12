import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requireClientActor } from "@/features/auth/server/context"
import { listClientTasks } from "@/features/orcamentos/server/portal"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/cliente/tasks?includeArchived= — tarefas que o cliente solicitou (visão do cliente). */
export const GET = withRoute(async ({ req }) => {
    const actor = await requireClientActor(req)
    const includeArchived = new URL(req.url).searchParams.get("includeArchived") === "true"
    return ok(await listClientTasks(actor.client, includeArchived))
})
