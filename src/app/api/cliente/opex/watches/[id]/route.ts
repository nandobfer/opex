import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requireClientActor } from "@/features/auth/server/context"
import { assertClientOpexEnabled } from "@/features/opex-agent/server/client-config"
import { clientOpexScope } from "@/features/opex-agent/server/scope"
import { cancelOpexWatch } from "@/features/opex-agent/server/watches"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** DELETE /api/cliente/opex/watches/[id] — cancela uma observação ativa do próprio usuário (outra é 404). */
export const DELETE = withRoute<{ id: string }>(async ({ req, params }) => {
    const actor = await requireClientActor(req)
    await assertClientOpexEnabled(actor)
    return ok(await cancelOpexWatch(params.id, actor.userId, clientOpexScope(actor)))
})
