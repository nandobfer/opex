import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { listWorkbenchReviews } from "@/features/adversarial-agent/server/reviews"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/adversarial/workbenches/[id]/reviews — rodadas do Agente Adversário na mesa (da mais
 * antiga para a mais nova), para a aba "Adversário". Responde mesmo com o adversário desativado, como a última rodada.
 */
export const GET = withRoute<{ id: string }>(async ({ params }) => ok(await listWorkbenchReviews(params.id)))
