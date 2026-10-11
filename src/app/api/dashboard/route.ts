import { ok, validationError } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { dashboardQuerySchema } from "@/features/dashboard/schemas"
import { buildDashboard } from "@/features/dashboard/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/dashboard?from&to&timeZone — KPIs e séries da tela Dashboards (período ISO + fuso IANA). */
export const GET = withRoute(async ({ req }) => {
    const params = req.nextUrl.searchParams
    const query = dashboardQuerySchema.safeParse({
        from: params.get("from") ?? undefined,
        to: params.get("to") ?? undefined,
        timeZone: params.get("timeZone") ?? undefined,
    })
    if (!query.success) return validationError(query.error)
    return ok(await buildDashboard(query.data))
})
