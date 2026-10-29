import { ok, validationError } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { prReviewListQuerySchema, requestPrReviewSchema } from "@/features/pr-review/schemas"
import { listPrReviews, requestPrReview } from "@/features/pr-review/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/pr-reviews?q&states&verdicts&repos&triggers&from&to&page&limit — revisões paginadas no
 * recorte dos filtros (listas em CSV, datas ISO), usuário do GitHub e repositórios acompanhados.
 */
export const GET = withRoute(async ({ req }) => {
    const params = req.nextUrl.searchParams
    const keys = ["q", "states", "verdicts", "repos", "triggers", "from", "to", "page", "limit"] as const
    const query = prReviewListQuerySchema.safeParse(Object.fromEntries(keys.map((key) => [key, params.get(key) ?? undefined])))
    if (!query.success) return validationError(query.error)
    return ok(await listPrReviews(query.data))
})

/** POST /api/pr-reviews — revisa um PR pela URL (`{ url }`), entrando na fila. */
export const POST = withRoute(async ({ req }) => {
    const body = await parseBody(req, requestPrReviewSchema)
    if (!body.ok) return body.response
    return ok(await requestPrReview(body.data.url))
})
