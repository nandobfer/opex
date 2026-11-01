import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { listMemoryUsage } from "@/features/engramind/server/memory-usage"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/engramind/memory-usage — último consumo de cada memória pelos agentes do Opex (rede, OPE-109). */
export const GET = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    return ok(await listMemoryUsage())
})
