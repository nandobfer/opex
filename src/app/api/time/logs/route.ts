import { ok, validationError } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { timeLogsQuerySchema } from "@/features/time/schemas"
import { listTimeLogs } from "@/features/time/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/time/logs?from&to&page — meus apontamentos no período (ISO). */
export const GET = withRoute(async ({ req }) => {
    const params = req.nextUrl.searchParams
    const query = timeLogsQuerySchema.safeParse({ from: params.get("from") ?? undefined, to: params.get("to") ?? undefined, page: params.get("page") ?? undefined })
    if (!query.success) return validationError(query.error)
    return ok(await listTimeLogs(query.data))
})
