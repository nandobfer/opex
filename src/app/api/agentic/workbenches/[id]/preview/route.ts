import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { workbenchPreviewSchema } from "@/features/agentic/schemas"
import { setWorkbenchPreview } from "@/features/agentic/server/workflow"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * PUT /api/agentic/workbenches/[id]/preview `{ enabled }` — chave "Gerar prévia" da mesa. Desligada,
 * a mesa pula a prévia e publica direto no PR (fluxo PR automático só nesta mesa); religada com a mesa
 * parada em PR aberto, gera a prévia do código atual na hora.
 */
export const PUT = withRoute<{ id: string }>(async ({ req, params }) => {
    const body = await parseBody(req, workbenchPreviewSchema)
    if (!body.ok) return body.response
    return ok(await setWorkbenchPreview(params.id, body.data))
})
