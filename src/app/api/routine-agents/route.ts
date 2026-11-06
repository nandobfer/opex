import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { requireAdminSession } from "@/features/auth/server/context"
import { routineAgentInputSchema } from "@/features/routine-agents/schemas"
import { createRoutineAgent, listRoutineAgents } from "@/features/routine-agents/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/routine-agents?filtro=arquivados — agentes rotineiros (padrão: não arquivados). */
export const GET = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    const filter = new URL(req.url).searchParams.get("filtro") === "arquivados" ? "archived" : "current"
    return ok(await listRoutineAgents(filter))
})

/** POST — cria o agente e dispara o subagente de provisionamento. */
export const POST = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    const body = await parseBody(req, routineAgentInputSchema)
    if (!body.ok) return body.response
    return ok(await createRoutineAgent(body.data, getLocalUser().id), { status: 201 })
})
