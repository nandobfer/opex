import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { interruptMaddoxSession } from "@/features/maddox-agent/server/runner"
import { requireClientActor } from "@/features/auth/server/context"
import { assertClientMaddoxEnabled } from "@/features/maddox-agent/server/client-config"
import { clientMaddoxScope } from "@/features/maddox-agent/server/sessions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/cliente/maddox/sessions/[id]/interrupt — para a resposta em andamento. */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    const actor = await requireClientActor(req)
    await assertClientMaddoxEnabled(actor)
    await interruptMaddoxSession(params.id, clientMaddoxScope(actor))
    return ok({ id: params.id })
})
