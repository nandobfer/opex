import { withRoute } from "@/lib/api/route"
import { openDeployStream } from "@/features/environments/server/stream"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/environments/deploys/[deployId]/events — log do deploy em NDJSON (ao vivo até o status final). */
export const POST = withRoute<{ deployId: string }>(async ({ req, params }) => {
    return openDeployStream(params.deployId, req.signal)
})
