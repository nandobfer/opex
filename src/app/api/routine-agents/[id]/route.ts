import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { requireAdminSession } from "@/features/auth/server/context"
import { routineAgentInputSchema } from "@/features/routine-agents/schemas"
import { getRoutineAgent, updateRoutineAgent } from "@/features/routine-agents/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { id: string }

/** GET /api/routine-agents/[id] — um agente rotineiro (sem o token). */
export const GET = withRoute<Params>(async ({ req, params }) => {
    await requireAdminSession(req)
    return ok(await getRoutineAgent(params.id))
})

/** PATCH — salva a configuração (não reprovisiona; motor e modelo valem para as próximas execuções). */
export const PATCH = withRoute<Params>(async ({ req, params }) => {
    await requireAdminSession(req)
    const body = await parseBody(req, routineAgentInputSchema)
    if (!body.ok) return body.response
    return ok(await updateRoutineAgent(params.id, body.data, getLocalUser().id))
})
