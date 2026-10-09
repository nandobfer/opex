import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { deleteWorkbench, getWorkbench } from "@/features/agentic/server/workflow"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const GET = withRoute<{ id: string }>(async ({ params }) => ok(await getWorkbench(params.id)))

/** DELETE /api/agentic/workbenches/[id] — interrompe (se preciso) e exclui a mesa e a saída dela. */
export const DELETE = withRoute<{ id: string }>(async ({ params }) => {
    await deleteWorkbench(params.id)
    return ok({ deleted: true })
})
