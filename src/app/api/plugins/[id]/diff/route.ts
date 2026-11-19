import { ok, validationError } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { pluginDiffQuerySchema } from "@/features/plugins/schemas"
import { diffPluginVersions } from "@/features/plugins/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/plugins/[id]/diff?to&from — diferença por arquivo entre duas versões (sem `from`: a base). */
export const GET = withRoute<{ id: string }>(async ({ req, params }) => {
    await requireAdminSession(req)
    const parsed = pluginDiffQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams))
    if (!parsed.success) return validationError(parsed.error)
    return ok(await diffPluginVersions(params.id, parsed.data.to, parsed.data.from ?? null))
})
