import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { workbenchPlanAfterRefinementSchema } from "@/features/agentic/schemas"
import { setWorkbenchPlanAfterRefinement } from "@/features/agentic/server/workflow"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * PUT /api/agentic/workbenches/[id]/refinement-plan `{ enabled }` — switch "Gerar plano após refinar" da
 * mesa em "Refinando" (OPE-137): vale o valor no momento em que a especificação fica pronta.
 */
export const PUT = withRoute<{ id: string }>(async ({ req, params }) => {
    const body = await parseBody(req, workbenchPlanAfterRefinementSchema)
    if (!body.ok) return body.response
    return ok(await setWorkbenchPlanAfterRefinement(params.id, body.data.enabled))
})
