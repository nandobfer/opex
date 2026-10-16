import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { getPrReview } from "@/features/pr-review/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/pr-reviews/[id] — revisão com o relatório. */
export const GET = withRoute<{ id: string }>(async ({ params }) => ok(await getPrReview(params.id)))
