import { withRoute } from "@/lib/api/route"
import { requireClientActor } from "@/features/auth/server/context"
import { assertClientOpexEnabled } from "@/features/opex-agent/server/client-config"
import { openSessionStream } from "@/features/opex-agent/server/stream"
import { clientOpexScope } from "@/features/opex-agent/server/scope"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/cliente/opex/sessions/[id]/stream — NDJSON da sessão do usuário. */
export const GET = withRoute<{ id: string }>(async ({ req, params }) => {
    const actor = await requireClientActor(req)
    await assertClientOpexEnabled(actor)
    return openSessionStream(params.id, req.signal, clientOpexScope(actor))
})
