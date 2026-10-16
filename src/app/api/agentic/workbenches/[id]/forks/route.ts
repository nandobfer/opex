import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { openForkSchema } from "@/features/agentic/schemas"
import { listForks, openFork } from "@/features/agentic/server/forks"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/agentic/workbenches/[id]/forks — forks da conversa da mesa (em ordem de número). */
export const GET = withRoute<{ id: string }>(async ({ params }) => ok(await listForks(params.id)))

/**
 * POST /api/agentic/workbenches/[id]/forks `{ text, parentForkId? }` — abre um fork da conversa
 * (somente leitura) com a primeira mensagem; com `parentForkId`, um fork de fork (copia a conversa do
 * fork pai). Responde na hora com o fork; a saída chega pelo stream do fork.
 */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    const body = await parseBody(req, openForkSchema)
    if (!body.ok) return body.response
    return ok(await openFork(params.id, body.data.text, body.data.parentForkId))
})
