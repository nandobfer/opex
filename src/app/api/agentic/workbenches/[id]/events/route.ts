import { withRoute } from "@/lib/api/route"
import { openWorkbenchStream } from "@/features/agentic/server/stream"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/agentic/workbenches/[id]/events — saída da mesa em NDJSON: `reset`, todos os eventos
 * gravados e, em seguida, os novos ao vivo (com `ping` a cada 15 s). Reconectar refaz tudo.
 */
export const GET = withRoute<{ id: string }>(async ({ req, params }) => openWorkbenchStream(params.id, req.signal))
