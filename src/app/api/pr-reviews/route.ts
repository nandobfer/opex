import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requestPrReviewSchema } from "@/features/pr-review/schemas"
import { listPrReviews, requestPrReview } from "@/features/pr-review/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/pr-reviews — histórico das revisões, usuário do GitHub e repositórios acompanhados. */
export const GET = withRoute(async () => ok(await listPrReviews()))

/** POST /api/pr-reviews — revisa um PR pela URL (`{ url }`), entrando na fila. */
export const POST = withRoute(async ({ req }) => {
    const body = await parseBody(req, requestPrReviewSchema)
    if (!body.ok) return body.response
    return ok(await requestPrReview(body.data.url))
})
