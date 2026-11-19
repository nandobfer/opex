import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { getPluginVersion } from "@/features/plugins/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/plugins/[id]/versions/[versionId] — fontes, manifesto e log de compilação da versão. */
export const GET = withRoute<{ id: string; versionId: string }>(async ({ req, params }) => {
    await requireAdminSession(req)
    return ok(await getPluginVersion(params.id, params.versionId))
})
