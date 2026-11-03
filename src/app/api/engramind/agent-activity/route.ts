import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { listAgentActivity } from "@/features/engramind/server/agent-activity"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/engramind/agent-activity — adoção por agente (gravações 7d, última, última entrega do contexto; OPE-117). */
export const GET = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    return ok(await listAgentActivity())
})
