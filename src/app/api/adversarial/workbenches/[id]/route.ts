import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { latestWorkbenchReview } from "@/features/adversarial-agent/server/reviews"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/adversarial/workbenches/[id] — última rodada do Agente Adversário na mesa (`null` sem
 * revisão). Responde mesmo com o adversário desativado: a mesa parada no bloqueio precisa decidir.
 */
export const GET = withRoute<{ id: string }>(async ({ params }) => ok(await latestWorkbenchReview(params.id)))
