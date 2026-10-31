import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { consumeSecretReveal } from "@/features/opex-agent/server/secret-reveals"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/opex/reveals/[id] — mostra UMA vez o segredo de um card do Agente Opex ("Ver token"). */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    await requireAdminSession(req)
    return ok(await consumeSecretReveal(params.id))
})
