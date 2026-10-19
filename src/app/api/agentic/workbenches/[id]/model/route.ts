import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { workbenchModelSchema } from "@/features/agentic/schemas"
import { setWorkbenchModel } from "@/features/agentic/server/workflow"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * PUT /api/agentic/workbenches/[id]/model `{ role, model, variant }` — troca o modelo de um papel da
 * conversa principal da mesa (`planning`, `implementation`, `build` ou `pr`); `model: null` volta ao
 * modelo do papel. Vale a partir do próximo turno.
 */
export const PUT = withRoute<{ id: string }>(async ({ req, params }) => {
    const body = await parseBody(req, workbenchModelSchema)
    if (!body.ok) return body.response
    return ok(await setWorkbenchModel(params.id, body.data))
})
