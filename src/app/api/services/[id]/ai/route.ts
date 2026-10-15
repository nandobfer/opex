import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requestServiceAi } from "@/features/services/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/services/[id]/ai — reinicia a geração de título/resumo/tags por IA (em segundo plano). */
export const POST = withRoute<{ id: string }>(async ({ params }) => {
    await requestServiceAi(params.id)
    return ok({ id: params.id })
})
