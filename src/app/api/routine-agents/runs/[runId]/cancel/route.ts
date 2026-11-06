import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { requireAdminSession } from "@/features/auth/server/context"
import { cancelRoutineRun } from "@/features/routine-agents/server/run-actions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/routine-agents/runs/[runId]/cancel — cancela a execução (qualquer status não final). */
export const POST = withRoute<{ runId: string }>(async ({ req, params }) => {
    await requireAdminSession(req)
    return ok(await cancelRoutineRun(params.runId, getLocalUser().id))
})
