import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { agentMemoryStatus } from "@/features/engramind/server/memory-network"
import { memoryIdentityParam } from "@/features/ai/server/memory-identity-param"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/ai/memories/agents/[consumer] — se o agente de memórias existe no Engramind (só o dono). */
export const GET = withRoute<{ consumer: string }>(async ({ req, params }) => {
    await requireAdminSession(req)
    return ok(await agentMemoryStatus(memoryIdentityParam(params.consumer)))
})
