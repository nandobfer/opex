import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { assertClientAdmin, requireClientActor } from "@/features/auth/server/context"
import { approvePluginPreviewFromPortal } from "@/features/agentic/server/plugin-workflow"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/cliente/plugins/[id]/approve — o admin do cliente aprova a versão em prévia: a mesa do
 * plugin segue para os testes do plugin e a consolidação (OPE-172).
 */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    const actor = await requireClientActor(req)
    assertClientAdmin(actor)
    await approvePluginPreviewFromPortal(params.id, String(actor.client._id), actor.userId)
    return ok({ ok: true as const })
})
