import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { listEnvironmentOptions } from "@/features/engramind/server/environments"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/engramind/environments — Ambientes cadastrados ou adotados (opções do seletor). */
export const GET = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    return ok(await listEnvironmentOptions())
})
