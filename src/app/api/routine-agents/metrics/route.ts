import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { METRICS_PERIODS, resolveMetricsRange, type MetricsPeriod } from "@/features/agent-metrics/period"
import { getRoutineAgentsMetrics } from "@/features/routine-agents/server/run-queries"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/routine-agents/metrics?periodo=30d&de=&ate= — KPIs e série por dia de cada agente não arquivado (lista `/agentes-rotineiros`). */
export const GET = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    const url = new URL(req.url)
    const raw = url.searchParams.get("periodo") ?? "30d"
    const periodo = ((METRICS_PERIODS as readonly string[]).includes(raw) ? raw : "30d") as MetricsPeriod
    const range = resolveMetricsRange({ periodo, de: url.searchParams.get("de"), ate: url.searchParams.get("ate") })
    return ok(await getRoutineAgentsMetrics({ from: range.from, to: range.to }))
})
