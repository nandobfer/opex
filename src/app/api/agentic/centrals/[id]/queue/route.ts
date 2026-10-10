import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { loadCentral } from "@/features/agentic/server/centrals"
import { listCentralQueue } from "@/features/agentic/server/queue"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/agentic/centrals/[id]/queue — tarefas aguardando na fila da central (posição pela ordem do kanban). */
export const GET = withRoute<{ id: string }>(async ({ params }) => {
    await loadCentral(params.id)
    return ok(await listCentralQueue(params.id))
})
