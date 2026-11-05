import { withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { deleteMemoryRoute, getMemoryRoute, patchMemoryRoute } from "@/features/ai/server/memory-routes"
import { loadAgentDoc } from "@/features/routine-agents/server/shared"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { id: string; memoryId: string }

const scopeOf = async (id: string) => ({ routineSlug: (await loadAgentDoc(id)).slug })

export const GET = withRoute<Params>(async ({ req, params }) => {
    await requireAdminSession(req)
    return getMemoryRoute("routine-specific", params.memoryId, await scopeOf(params.id))
})

export const PATCH = withRoute<Params>(async ({ req, params }) => {
    await requireAdminSession(req)
    return patchMemoryRoute(req, "routine-specific", params.memoryId, await scopeOf(params.id))
})

export const DELETE = withRoute<Params>(async ({ req, params }) => {
    await requireAdminSession(req)
    return deleteMemoryRoute("routine-specific", params.memoryId, await scopeOf(params.id))
})
