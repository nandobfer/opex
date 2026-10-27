import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { listAdversarialReviews } from "@/features/adversarial-agent/server/reviews"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/adversarial/reviews — últimas rodadas do Agente Adversário (aba Revisões). */
export const GET = withRoute(async () => ok(await listAdversarialReviews()))
