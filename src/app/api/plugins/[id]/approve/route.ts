import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { requireAdminSession } from "@/features/auth/server/context"
import { approvePluginPreview } from "@/features/agentic/server/plugin-workflow"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/plugins/[id]/approve — o dono aprova a versão em prévia pela página do plugin: a mesa
 * dona da prévia segue para os testes do plugin e a consolidação (OPE-172).
 */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    await requireAdminSession(req)
    await approvePluginPreview(params.id, { kind: "owner" }, getLocalUser().id)
    return ok({ ok: true as const })
})
