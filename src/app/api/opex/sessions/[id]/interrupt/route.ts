import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { interruptSession } from "@/features/opex-agent/server/runner"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/opex/sessions/[id]/interrupt — para a resposta em andamento (a parte já gerada é mantida). */
export const POST = withRoute<{ id: string }>(async ({ params }) => {
    await interruptSession(params.id)
    return ok({ id: params.id })
})
