import { startOfMonth } from "date-fns"
import { ok, validationError } from "@/lib/api/responses"
import { DomainError, withRoute } from "@/lib/api/route"
import { assertClientAdmin, requireClientActor } from "@/features/auth/server/context"
import { clienteFinanceQuerySchema } from "@/features/orcamentos/schemas"
import { listClientCost } from "@/features/orcamentos/server/portal-finance"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/cliente/financeiro?from&to&projectIds — custo das tarefas concluídas por repositório (admin). */
export const GET = withRoute(async ({ req }) => {
    const actor = await requireClientActor(req)
    assertClientAdmin(actor)
    const params = req.nextUrl.searchParams
    const parsed = clienteFinanceQuerySchema.safeParse({
        from: params.get("from") ?? undefined,
        to: params.get("to") ?? undefined,
        projectIds: params.get("projectIds") ?? undefined,
    })
    if (!parsed.success) return validationError(parsed.error)

    const now = new Date()
    const from = parsed.data.from ?? startOfMonth(now).toISOString()
    const to = parsed.data.to ?? now.toISOString()
    if (new Date(from).getTime() > new Date(to).getTime()) throw new DomainError(400, "Período inválido: a data inicial é posterior à final.", "INVALID_RANGE")

    return ok(await listClientCost(String(actor.client._id), { from, to, projectIds: parsed.data.projectIds }))
})
