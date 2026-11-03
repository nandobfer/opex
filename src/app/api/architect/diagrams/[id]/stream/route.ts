import { withRoute } from "@/lib/api/route"
import { openDiagramStream } from "@/features/architect-agent/server/stream"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/architect/diagrams/[id]/stream — NDJSON do diagrama ao vivo: `snapshot`, `ops` numeradas, `progress`, `end`. */
export const GET = withRoute<{ id: string }>(async ({ req, params }) => openDiagramStream(params.id, req.signal))
