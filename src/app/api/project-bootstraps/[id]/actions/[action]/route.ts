import { ok } from "@/lib/api/responses"
import { DomainError, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { PROJECT_BOOTSTRAP_ACTIONS, type ProjectBootstrapAction } from "@/features/project-bootstrap/constants"
import { runProjectBootstrapAction } from "@/features/project-bootstrap/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/project-bootstraps/[id]/actions/[action] — `retry`, `cancel` ou `reconnect`. */
export const POST = withRoute<{ id: string; action: string }>(async ({ params }) => {
    if (!(PROJECT_BOOTSTRAP_ACTIONS as readonly string[]).includes(params.action)) throw new DomainError(404, "Ação desconhecida", "UNKNOWN_ACTION")
    return ok(await runProjectBootstrapAction(params.id, params.action as ProjectBootstrapAction, getLocalUser().id))
})
