import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { forkMessageSchema } from "@/features/agentic/schemas"
import { sendForkMessage } from "@/features/agentic/server/forks"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/agentic/workbenches/[id]/forks/[forkId]/messages `{ text }` — nova mensagem no fork ativo. */
export const POST = withRoute<{ id: string; forkId: string }>(async ({ req, params }) => {
    const body = await parseBody(req, forkMessageSchema)
    if (!body.ok) return body.response
    return ok(await sendForkMessage(params.id, params.forkId, body.data.text))
})
