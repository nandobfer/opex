import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { interruptMaddoxSession } from "@/features/maddox-agent/server/runner"
import { MADDOX_OWNER_SCOPE } from "@/features/maddox-agent/server/sessions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/maddox/sessions/[id]/interrupt — para a resposta (interrompe a sessão do OpenCode). */
export const POST = withRoute<{ id: string }>(async ({ params }) => {
    await interruptMaddoxSession(params.id, MADDOX_OWNER_SCOPE)
    return ok({ id: params.id })
})
