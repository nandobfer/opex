import { created } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { refineWorkbenchSchema } from "@/features/agentic/schemas"
import { refineWorkbench } from "@/features/agentic/server/workflow"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/agentic/workbenches/refine `{ centralId, taskId, text?, fileIds?, modelOverrides? }` —
 * "Refinar tarefa" (OPE-137): abre a mesa em "Refinando" (ou em "Especificação pronta", com o refinamento
 * já concluído). Sem vaga, a tarefa vai para a fila da central e a resposta traz `{ workbench: null,
 * queue: { position } }`.
 */
export const POST = withRoute(async ({ req }) => {
    const body = await parseBody(req, refineWorkbenchSchema)
    if (!body.ok) return body.response
    return created(await refineWorkbench(body.data.centralId, body.data.taskId, { text: body.data.text, fileIds: body.data.fileIds, modelOverrides: body.data.modelOverrides }))
})
