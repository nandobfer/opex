import { ok, validationError } from "@/lib/api/responses"
import { DomainError, withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { isAgentId } from "@/features/agent-metrics/catalog"
import { agentMetricsQuerySchema } from "@/features/agent-metrics/period"
import { getAgentMetrics } from "@/features/agent-metrics/server/metrics"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/agents/[agent]/metrics?periodo&de&ate&clientes&repositorios&margem — Visão geral do agente
 * (KPIs, séries e uso por data), calculada no servidor. Ver aicontext/modules/agent-metrics.md.
 */
export const GET = withRoute<{ agent: string }>(async ({ req, params }) => {
    await requireAdminSession(req)
    if (!isAgentId(params.agent)) throw new DomainError(404, "Agente não encontrado", "AGENT_NOT_FOUND")
    const search = req.nextUrl.searchParams
    const query = agentMetricsQuerySchema.safeParse(Object.fromEntries(["periodo", "de", "ate", "clientes", "repositorios", "margem"].map((key) => [key, search.get(key) ?? undefined])))
    if (!query.success) return validationError(query.error)
    return ok(await getAgentMetrics(params.agent, query.data))
})
