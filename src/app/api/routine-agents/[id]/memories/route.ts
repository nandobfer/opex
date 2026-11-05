import { withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { createMemoryRoute, listMemoriesRoute } from "@/features/ai/server/memory-routes"
import { loadAgentDoc } from "@/features/routine-agents/server/shared"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { id: string }

/** GET /api/routine-agents/[id]/memories — memórias do canal próprio do agente rotineiro. */
export const GET = withRoute<Params>(async ({ req, params }) => {
    await requireAdminSession(req)
    return listMemoriesRoute("routine-specific", { routineSlug: (await loadAgentDoc(params.id)).slug })
})

/** POST — nova memória do agente (`{ texto, categoria?, fixada? }`). */
export const POST = withRoute<Params>(async ({ req, params }) => {
    await requireAdminSession(req)
    return createMemoryRoute(req, "routine-specific", { routineSlug: (await loadAgentDoc(params.id)).slug })
})
