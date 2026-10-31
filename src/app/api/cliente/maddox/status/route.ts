import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requireClientActor } from "@/features/auth/server/context"
import { clientMaddoxStatus } from "@/features/maddox-agent/server/client-config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/cliente/maddox/status — se o Agente Maddox está ligado para o cliente, disponível, a cor e o modelo padrão. */
export const GET = withRoute(async ({ req }) => {
    const actor = await requireClientActor(req)
    return ok(await clientMaddoxStatus(actor))
})
