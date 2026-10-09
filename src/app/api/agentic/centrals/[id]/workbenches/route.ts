import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { loadCentral } from "@/features/agentic/server/centrals"
import { listCentralWorkbenches } from "@/features/agentic/server/workflow"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/agentic/centrals/[id]/workbenches — resumo das mesas da central (etapa por tarefa). */
export const GET = withRoute<{ id: string }>(async ({ params }) => {
    await loadCentral(params.id)
    return ok(await listCentralWorkbenches(params.id))
})
