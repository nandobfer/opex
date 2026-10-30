import { ok, validationError } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { logsQuerySchema } from "@/features/opencode-service/schemas"
import { getServiceLogs } from "@/features/opencode-service/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/ai/providers/opencode/service/logs?lines= — últimas linhas do log do OpenCode (sem cores e sem linhas com segredo). */
export const GET = withRoute(async ({ req }) => {
    const parsed = logsQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams))
    if (!parsed.success) return validationError(parsed.error)
    return ok(await getServiceLogs(parsed.data.lines))
})
