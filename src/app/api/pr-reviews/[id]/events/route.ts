import { withRoute } from "@/lib/api/route"
import { openPrReviewStream } from "@/features/pr-review/server/stream"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/pr-reviews/[id]/events — saída do agente ao vivo (NDJSON): `reset` + o que foi gravado +
 * o que chegar depois. Fechar a conexão cancela só o stream (a revisão segue no servidor).
 */
export const GET = withRoute<{ id: string }>(async ({ req, params }) => openPrReviewStream(params.id, req.signal))
