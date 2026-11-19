import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requireClientActor } from "@/features/auth/server/context"
import { previewListFromRequest } from "@/features/plugins/server/preview-cookie"
import { buildRuntimeManifest } from "@/features/plugins/server/runtime-manifest"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/cliente/plugins/runtime — plugins (só interface) que o portal deste cliente monta. */
export const GET = withRoute(async ({ req }) => {
    const actor = await requireClientActor(req)
    // Pré-visualização do dono (sessão admin): só os plugins cuja prévia ele ligou neste navegador.
    return ok(await buildRuntimeManifest({ kind: "client", clientId: String(actor.client._id) }, previewListFromRequest(req), { ownerPreview: actor.preview }))
})
