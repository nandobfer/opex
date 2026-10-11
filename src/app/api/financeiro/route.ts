import { ok, validationError } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { financeQuerySchema } from "@/features/finance/schemas"
import { listFinanceByClient } from "@/features/finance/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/financeiro?from&to — faturamento das tarefas concluídas por cliente (período ISO). */
export const GET = withRoute(async ({ req }) => {
    const params = req.nextUrl.searchParams
    const query = financeQuerySchema.safeParse({ from: params.get("from") ?? undefined, to: params.get("to") ?? undefined })
    if (!query.success) return validationError(query.error)
    return ok(await listFinanceByClient(query.data))
})
