import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { openForkSchema } from "@/features/agentic/schemas"
import { listForks, openFork } from "@/features/agentic/server/forks"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/agentic/workbenches/[id]/forks — forks da conversa da mesa (em ordem de número). */
export const GET = withRoute<{ id: string }>(async ({ params }) => ok(await listForks(params.id)))

/**
 * POST /api/agentic/workbenches/[id]/forks `{ text, parentForkId?, readOnly?, mode?, fileIds? }` — abre um fork
 * da conversa com a primeira mensagem; o modo inicial vem do agente do papel Fork (ou de `mode`) e
 * `readOnly` trava o fork em Plan (somente leitura, sem volta). Com `parentForkId`, um fork de fork
 * (copia a conversa do fork pai, sem herdar a trava). Responde na hora; a saída chega pelo stream.
 */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    const body = await parseBody(req, openForkSchema)
    if (!body.ok) return body.response
    const { text, parentForkId, readOnly, mode, fileIds } = body.data
    return ok(await openFork(params.id, text, { parentForkId, readOnly, mode, fileIds }))
})
