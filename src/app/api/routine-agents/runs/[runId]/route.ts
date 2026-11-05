import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { getRoutineRunDetail } from "@/features/routine-agents/server/run-queries"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/routine-agents/runs/[runId] — detalhe da execução (passos, ferramentas, relato, ação pendente). */
export const GET = withRoute<{ runId: string }>(async ({ req, params }) => {
    await requireAdminSession(req)
    return ok(await getRoutineRunDetail(params.runId))
})
