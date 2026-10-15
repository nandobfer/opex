import { ok, validationError } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { financeQuerySchema } from "@/features/finance/schemas"
import { listFinanceByClient } from "@/features/finance/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/financeiro?from&to&clientIds&projectIds — faturamento das tarefas concluídas por cliente.
 * Período em ISO; `clientIds`/`projectIds` são listas de ids separados por vírgula (sem filtro = todos).
 */
export const GET = withRoute(async ({ req }) => {
    const params = req.nextUrl.searchParams
    const query = financeQuerySchema.safeParse({
        from: params.get("from") ?? undefined,
        to: params.get("to") ?? undefined,
        clientIds: params.get("clientIds") ?? undefined,
        projectIds: params.get("projectIds") ?? undefined,
        archived: params.get("archived") ?? undefined,
    })
    if (!query.success) return validationError(query.error)
    return ok(await listFinanceByClient(query.data))
})
