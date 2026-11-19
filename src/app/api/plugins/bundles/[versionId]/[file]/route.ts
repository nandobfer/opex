import { withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { bundleResponse } from "@/features/plugins/server/http"
import { OWNER_ACCESS } from "@/features/plugins/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/plugins/bundles/[versionId]/[hash].js|css — bundle do navegador, imutável por revisão. */
export const GET = withRoute<{ versionId: string; file: string }>(async ({ req, params }) => {
    await requireAdminSession(req)
    return bundleResponse(OWNER_ACCESS, params.versionId, params.file)
})
