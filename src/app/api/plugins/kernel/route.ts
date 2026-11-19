import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { inspectPluginRuntime } from "@/features/plugins/server/kernel/kernel"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/plugins/kernel — fotografia do runtime (fibers, ferramentas, rotas, crons e modo da instância). */
export const GET = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    return ok(await inspectPluginRuntime())
})
