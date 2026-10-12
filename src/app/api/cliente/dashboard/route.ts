import { startOfMonth } from "date-fns"
import { ok, validationError } from "@/lib/api/responses"
import { DomainError, withRoute } from "@/lib/api/route"
import { requireClientActor } from "@/features/auth/server/context"
import { clientePeriodQuerySchema } from "@/features/orcamentos/schemas"
import { buildClientDashboard } from "@/features/orcamentos/server/portal-dashboard"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/cliente/dashboard?from&to&timeZone — distribuições de tarefas do cliente no período
 * (coluna, tags, repositórios e criadas × concluídas) e, para o **admin**, o resumo de custo.
 */
export const GET = withRoute(async ({ req }) => {
    const actor = await requireClientActor(req)
    const params = req.nextUrl.searchParams
    const parsed = clientePeriodQuerySchema.safeParse({
        from: params.get("from") ?? undefined,
        to: params.get("to") ?? undefined,
        timeZone: params.get("timeZone") ?? undefined,
    })
    if (!parsed.success) return validationError(parsed.error)

    const now = new Date()
    const from = parsed.data.from ?? startOfMonth(now).toISOString()
    const to = parsed.data.to ?? now.toISOString()
    if (new Date(from).getTime() > new Date(to).getTime()) throw new DomainError(400, "Período inválido: a data inicial é posterior à final.", "INVALID_RANGE")

    return ok(await buildClientDashboard(String(actor.client._id), { from, to }, actor.isAdmin, parsed.data.timeZone ?? "UTC"))
})
