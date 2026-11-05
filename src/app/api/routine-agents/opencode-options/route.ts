import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { routineOpencodeOptions } from "@/features/routine-agents/server/opencode-options"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/routine-agents/opencode-options — MCPs do opencode.jsonc do host e o MCP de navegador. */
export const GET = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    return ok(await routineOpencodeOptions())
})
