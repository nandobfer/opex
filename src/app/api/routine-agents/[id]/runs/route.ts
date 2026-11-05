import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { requireAdminSession } from "@/features/auth/server/context"
import { routineRunRequestSchema } from "@/features/routine-agents/schemas"
import { listRoutineRuns } from "@/features/routine-agents/server/run-queries"
import { triggerRoutineRun } from "@/features/routine-agents/server/runs"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { id: string }

/** GET /api/routine-agents/[id]/runs — execuções do agente (mais recentes primeiro). */
export const GET = withRoute<Params>(async ({ req, params }) => {
    await requireAdminSession(req)
    return ok(await listRoutineRuns({ agentId: params.id }))
})

/** POST — "Executar agora" (`{ request? }`). */
export const POST = withRoute<Params>(async ({ req, params }) => {
    await requireAdminSession(req)
    const body = await parseBody(req, routineRunRequestSchema)
    if (!body.ok) return body.response
    return ok(await triggerRoutineRun(params.id, { origin: "manual", request: body.data.request ?? null }, getLocalUser().id), { status: 201 })
})
