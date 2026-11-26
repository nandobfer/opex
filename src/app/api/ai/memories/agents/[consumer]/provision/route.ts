import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { requireAdminSession } from "@/features/auth/server/context"
import { ensureAgentMemoryNetwork } from "@/features/engramind/server/memory-network"
import { memoryIdentityParam } from "@/features/ai/server/memory-identity-param"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/ai/memories/agents/[consumer]/provision — "Cadastrar agente no Engramind" (só o dono). Reaproveita o
 * passo "Memórias dos agentes" (idempotente e auditado): canais, agentes, assinaturas e tokens.
 */
export const POST = withRoute<{ consumer: string }>(async ({ req, params }) => {
    await requireAdminSession(req)
    memoryIdentityParam(params.consumer)
    return ok((await ensureAgentMemoryNetwork(getLocalUser().id)).step)
})
