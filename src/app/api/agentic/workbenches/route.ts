import { created } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { startWorkbenchSchema } from "@/features/agentic/schemas"
import { startWorkbench } from "@/features/agentic/server/workflow"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/agentic/workbenches — abre a mesa da tarefa e inicia o planejamento. */
export const POST = withRoute(async ({ req }) => {
    const body = await parseBody(req, startWorkbenchSchema)
    if (!body.ok) return body.response
    return created(await startWorkbench(body.data.centralId, body.data.taskId, body.data.text, body.data.fileIds))
})
