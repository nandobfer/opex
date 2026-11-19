import { ok, validationError } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { pluginListQuerySchema } from "@/features/plugins/schemas"
import { listPlugins, OWNER_ACCESS } from "@/features/plugins/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/plugins?scope&clientId — plugins do dono e dos clientes (OPE-172). */
export const GET = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    const parsed = pluginListQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams))
    if (!parsed.success) return validationError(parsed.error)
    return ok(await listPlugins(OWNER_ACCESS, parsed.data))
})
