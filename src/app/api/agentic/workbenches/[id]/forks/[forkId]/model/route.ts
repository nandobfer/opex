import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { modelOverrideSchema } from "@/features/agentic/schemas"
import { setForkModel } from "@/features/agentic/server/forks"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * PUT /api/agentic/workbenches/[id]/forks/[forkId]/model `{ model, variant }` — troca o modelo do fork;
 * `model: null` volta ao modelo do papel Fork da conversa. Vale a partir da próxima mensagem.
 */
export const PUT = withRoute<{ id: string; forkId: string }>(async ({ req, params }) => {
    const body = await parseBody(req, modelOverrideSchema)
    if (!body.ok) return body.response
    return ok(await setForkModel(params.id, params.forkId, body.data))
})
