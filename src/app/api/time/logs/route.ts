import { queryToObject } from "@/lib/api/query"
import { ok, validationError } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { timeLogsQuerySchema } from "@/features/time/schemas"
import { listTimeLogs } from "@/features/time/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/time/logs?from&to&page&projects&types — apontamentos do período (ISO), filtráveis por repositório e tipo. */
export const GET = withRoute(async ({ req }) => {
    const query = timeLogsQuerySchema.safeParse(queryToObject(req.nextUrl.searchParams, ["projects", "types"]))
    if (!query.success) return validationError(query.error)
    return ok(await listTimeLogs(query.data))
})
