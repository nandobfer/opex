import { withRoute } from "@/lib/api/route"
import { openSessionStream } from "@/features/opex-agent/server/stream"
import { requireClientActor } from "@/features/auth/server/context"
import { assertClientMaddoxEnabled } from "@/features/maddox-agent/server/client-config"
import { clientMaddoxScope } from "@/features/maddox-agent/server/sessions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/cliente/maddox/sessions/[id]/stream — NDJSON da sessão do usuário. */
export const GET = withRoute<{ id: string }>(async ({ req, params }) => {
    const actor = await requireClientActor(req)
    await assertClientMaddoxEnabled(actor)
    return openSessionStream(params.id, req.signal, clientMaddoxScope(actor))
})
