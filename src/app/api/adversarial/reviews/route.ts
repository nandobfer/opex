import { ok, validationError } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { adversarialReviewListQuerySchema } from "@/features/adversarial-agent/schemas"
import { listAdversarialReviews } from "@/features/adversarial-agent/server/reviews"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/adversarial/reviews?q&states&decisions&levels&centrals&from&to&page&limit — rodadas do
 * Agente Adversário paginadas no recorte dos filtros (listas em CSV, datas ISO) e as centrais.
 */
export const GET = withRoute(async ({ req }) => {
    const params = req.nextUrl.searchParams
    const keys = ["q", "states", "decisions", "levels", "centrals", "from", "to", "page", "limit"] as const
    const query = adversarialReviewListQuerySchema.safeParse(Object.fromEntries(keys.map((key) => [key, params.get(key) ?? undefined])))
    if (!query.success) return validationError(query.error)
    return ok(await listAdversarialReviews(query.data))
})
