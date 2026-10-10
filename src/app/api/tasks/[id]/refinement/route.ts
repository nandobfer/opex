import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { deleteRefinement, getRefinementState, startRefinement } from "@/features/refinement/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/tasks/[id]/refinement — estado do refinamento e a disponibilidade (botão). */
export const GET = withRoute<{ id: string }>(async ({ params }) => ok(await getRefinementState(params.id)))

/** POST /api/tasks/[id]/refinement — inicia o refinamento (idempotente) e dispara o primeiro turno. */
export const POST = withRoute<{ id: string }>(async ({ params }) => ok(await startRefinement(params.id)))

/** DELETE /api/tasks/[id]/refinement — exclui o refinamento da tarefa. */
export const DELETE = withRoute<{ id: string }>(async ({ params }) => {
    await deleteRefinement(params.id)
    return ok({ deleted: true })
})
