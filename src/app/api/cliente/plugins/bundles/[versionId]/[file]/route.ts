import { withRoute } from "@/lib/api/route"
import { requireClientActor } from "@/features/auth/server/context"
import { bundleResponse } from "@/features/plugins/server/http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/cliente/plugins/bundles/[versionId]/[hash].js|css — bundle do plugin do próprio cliente. */
export const GET = withRoute<{ versionId: string; file: string }>(async ({ req, params }) => {
    const actor = await requireClientActor(req)
    return bundleResponse({ kind: "client", clientId: String(actor.client._id) }, params.versionId, params.file)
})
