import { withRoute } from "@/lib/api/route"
import { openBuildLogStream } from "@/features/agentic/server/build-logs"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/agentic/workbenches/[id]/builds/[buildId]/log — log do build em NDJSON: `snapshot`, os
 * trechos novos ao vivo (`append`, com `ping` a cada 15 s) e o `status` final. Build encerrado:
 * só o `snapshot`. Reconectar refaz tudo.
 */
export const GET = withRoute<{ id: string; buildId: string }>(async ({ req, params }) => openBuildLogStream(params.id, params.buildId, req.signal))
