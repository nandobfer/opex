import { ok } from "@/lib/api/responses"
import { DomainError, withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { getRoutineAgentMetrics } from "@/features/routine-agents/server/run-queries"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/routine-agents/[id]/metrics?from=ISO&to=ISO — KPIs e série por dia da Visão geral. */
export const GET = withRoute<{ id: string }>(async ({ req, params }) => {
    await requireAdminSession(req)
    const url = new URL(req.url)
    const to = url.searchParams.get("to") ? new Date(url.searchParams.get("to")!) : new Date()
    const from = url.searchParams.get("from") ? new Date(url.searchParams.get("from")!) : new Date(to.getTime() - 30 * 86_400_000)
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) throw new DomainError(400, "Período inválido", "VALIDATION_ERROR")
    return ok(await getRoutineAgentMetrics(params.id, { from, to }))
})
