import { ok, validationError } from "@/lib/api/responses"
import { DomainError, withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { isAgentId } from "@/features/agent-metrics/catalog"
import { agentHistoryQuerySchema } from "@/features/agent-metrics/period"
import { getAgentHistory } from "@/features/agent-metrics/server/history"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/agents/[agent]/history?periodo&de&ate&clientes&repositorios&page&limit — aba Histórico (paginada). */
export const GET = withRoute<{ agent: string }>(async ({ req, params }) => {
    await requireAdminSession(req)
    if (!isAgentId(params.agent)) throw new DomainError(404, "Agente não encontrado", "AGENT_NOT_FOUND")
    const search = req.nextUrl.searchParams
    const query = agentHistoryQuerySchema.safeParse(Object.fromEntries(["periodo", "de", "ate", "clientes", "repositorios", "page", "limit"].map((key) => [key, search.get(key) ?? undefined])))
    if (!query.success) return validationError(query.error)
    return ok(await getAgentHistory(params.agent, query.data))
})
