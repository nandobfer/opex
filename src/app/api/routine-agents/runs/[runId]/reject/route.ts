import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { requireAdminSession } from "@/features/auth/server/context"
import { routineActionResolutionSchema } from "@/features/routine-agents/schemas"
import { resolveRoutineAction } from "@/features/routine-agents/server/run-actions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/routine-agents/runs/[runId]/reject — Recusa a ação pendente (segunda resposta → 409 `ROUTINE_ACTION_ALREADY_RESOLVED`). */
export const POST = withRoute<{ runId: string }>(async ({ req, params }) => {
    await requireAdminSession(req)
    const body = await parseBody(req, routineActionResolutionSchema)
    if (!body.ok) return body.response
    return ok(await resolveRoutineAction(params.runId, "rejected", getLocalUser().id, body.data.note))
})
