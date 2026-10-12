import { startOfMonth } from "date-fns"
import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requireClientActor } from "@/features/auth/server/context"
import { clientePeriodQuerySchema } from "@/features/orcamentos/schemas"
import { buildClientDashboard } from "@/features/orcamentos/server/portal-dashboard"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/cliente/dashboard?from&to — KPIs de tarefas do cliente (custo só para o admin). */
export const GET = withRoute(async ({ req }) => {
    const actor = await requireClientActor(req)
    const params = req.nextUrl.searchParams
    const parsed = clientePeriodQuerySchema.safeParse({ from: params.get("from") ?? undefined, to: params.get("to") ?? undefined })
    const now = new Date()
    const from = parsed.success && parsed.data.from ? parsed.data.from : startOfMonth(now).toISOString()
    const to = parsed.success && parsed.data.to ? parsed.data.to : now.toISOString()
    return ok(await buildClientDashboard(String(actor.client._id), { from, to }, actor.isAdmin))
})
