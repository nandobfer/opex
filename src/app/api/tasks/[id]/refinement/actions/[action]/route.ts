import { ok } from "@/lib/api/responses"
import { DomainError, withRoute } from "@/lib/api/route"
import { REFINEMENT_ACTIONS } from "@/features/refinement/constants"
import { continueRefinement, interruptRefinement, reconnectRefinement, restartRefinement } from "@/features/refinement/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/tasks/[id]/refinement/actions/[action] — interromper, recomeçar, continuar ou reconectar. */
export const POST = withRoute<{ id: string; action: string }>(async ({ params }) => {
    const action = params.action
    if (!(REFINEMENT_ACTIONS as readonly string[]).includes(action)) throw new DomainError(400, "Ação inválida", "REFINEMENT_INVALID_ACTION")
    if (action === "interrupt") return ok(await interruptRefinement(params.id))
    if (action === "restart") return ok(await restartRefinement(params.id))
    if (action === "reconnect") return ok(await reconnectRefinement(params.id))
    return ok(await continueRefinement(params.id))
})
