import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requireClientActor } from "@/features/auth/server/context"
import { clientOpexStatus } from "@/features/opex-agent/server/client-config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/cliente/opex/status — se o Agente Opex está ativo para o cliente e se o modelo responde. */
export const GET = withRoute(async ({ req }) => {
    const actor = await requireClientActor(req)
    return ok(await clientOpexStatus(actor))
})
