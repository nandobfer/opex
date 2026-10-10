import { withRoute } from "@/lib/api/route"
import { openRefinementStream } from "@/features/refinement/server/stream"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/tasks/[id]/refinement/events — saída do agente ao vivo (NDJSON): `reset` + tudo o que foi
 * gravado + o que chegar depois, com `ping` periódico. Fechar a conexão cancela só o stream (o turno
 * segue no servidor).
 */
export const GET = withRoute<{ id: string }>(async ({ req, params }) => openRefinementStream(params.id, req.signal))
