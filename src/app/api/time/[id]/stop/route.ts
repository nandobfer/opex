import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { stopTimerSchema } from "@/features/time/schemas"
import { stopTimer } from "@/features/time/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/time/[id]/stop — para o timer (início/fim/descrição opcionais). */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    const body = await parseBody(req, stopTimerSchema)
    if (!body.ok) return body.response
    return ok(await stopTimer(params.id, body.data, getLocalUser().id))
})
