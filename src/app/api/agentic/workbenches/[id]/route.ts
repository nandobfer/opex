import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { deleteWorkbench, getWorkbench } from "@/features/agentic/server/workflow"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const GET = withRoute<{ id: string }>(async ({ params }) => ok(await getWorkbench(params.id)))

/**
 * DELETE /api/agentic/workbenches/[id] — exclui a mesa. Antes de apagar o registro ela roda a
 * mesma limpeza de ambiente da conclusão (respeitando as opções da central) e exclui a sessão do
 * OpenCode. `deleted: false` = a limpeza ficou em andamento; a mesa sai quando ela terminar.
 */
export const DELETE = withRoute<{ id: string }>(async ({ params }) => ok(await deleteWorkbench(params.id)))
