import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { channelNamespaceOrLegacy } from "@/features/engramind/server/instance"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/engramind/namespace — app da instância e se os canais levam o app na frente (OPE-206). */
export const GET = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    return ok(await channelNamespaceOrLegacy())
})
