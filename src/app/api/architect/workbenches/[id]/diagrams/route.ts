import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { architectGenerateSchema } from "@/features/architect-agent/schemas"
import { listWorkbenchDiagrams, requestDiagram } from "@/features/architect-agent/server/diagrams"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/architect/workbenches/[id]/diagrams — versões do diagrama da mesa (da mais antiga à mais nova). */
export const GET = withRoute<{ id: string }>(async ({ params }) => ok(await listWorkbenchDiagrams(params.id)))

/**
 * POST /api/architect/workbenches/[id]/diagrams — "Gerar arquitetura" (`{ depth? }`) ou "Pedir ajustes"
 * (`{ feedback, depth?, baseDiagramId? }`). Responde na hora com a versão "gerando"; o resultado chega pelo Pusher.
 */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    const body = await parseBody(req, architectGenerateSchema)
    if (!body.ok) return body.response
    return ok(await requestDiagram(params.id, body.data, "manual"))
})
