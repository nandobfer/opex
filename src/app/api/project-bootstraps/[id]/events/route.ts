import { withRoute } from "@/lib/api/route"
import { openEventStream } from "@/features/agentic/server/stream"
import { assertBootstrapExists } from "@/features/project-bootstrap/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/project-bootstraps/[id]/events — conversa do agente ao vivo (NDJSON: `reset` + gravado + o que chegar). */
export const GET = withRoute<{ id: string }>(async ({ req, params }) => {
    await assertBootstrapExists(params.id)
    return openEventStream(params.id, req.signal)
})
