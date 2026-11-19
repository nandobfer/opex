import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { previewListFromRequest } from "@/features/plugins/server/preview-cookie"
import { buildRuntimeManifest } from "@/features/plugins/server/runtime-manifest"
import { OWNER_ACCESS } from "@/features/plugins/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/plugins/runtime — o que o navegador do dono monta (stable, ou preview com a prévia ligada). */
export const GET = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    return ok(await buildRuntimeManifest(OWNER_ACCESS, previewListFromRequest(req)))
})
