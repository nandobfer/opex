import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requireClientActor } from "@/features/auth/server/context"
import { assertClientOpexEnabled } from "@/features/opex-agent/server/client-config"
import { clientOpexScope } from "@/features/opex-agent/server/scope"
import { listSessionWatches } from "@/features/opex-agent/server/watches"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/cliente/opex/sessions/[id]/watches — observações ativas da própria sessão. */
export const GET = withRoute<{ id: string }>(async ({ req, params }) => {
    const actor = await requireClientActor(req)
    await assertClientOpexEnabled(actor)
    return ok(await listSessionWatches(params.id, clientOpexScope(actor)))
})
