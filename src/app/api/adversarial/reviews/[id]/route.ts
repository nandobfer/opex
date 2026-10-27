import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { getAdversarialReview } from "@/features/adversarial-agent/server/reviews"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/adversarial/reviews/[id] — uma rodada com os achados e o relatório (aberta também da saída da mesa). */
export const GET = withRoute<{ id: string }>(async ({ params }) => ok(await getAdversarialReview(params.id)))
