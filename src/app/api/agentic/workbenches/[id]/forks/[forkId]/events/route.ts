import { withRoute } from "@/lib/api/route"
import { openEventStream } from "@/features/agentic/server/stream"
import { assertForkExists } from "@/features/agentic/server/forks"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/agentic/workbenches/[id]/forks/[forkId]/events — saída do fork em NDJSON (`reset` + gravado + ao vivo). */
export const GET = withRoute<{ id: string; forkId: string }>(async ({ req, params }) => openEventStream(params.forkId, req.signal, (forkId) => assertForkExists(params.id, forkId)))
