import { created } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { sendOpexMessageSchema } from "@/features/opex-agent/schemas"
import { sendMaddoxMessage } from "@/features/maddox-agent/server/runner"
import { requireClientActor } from "@/features/auth/server/context"
import { assertClientMaddoxEnabled } from "@/features/maddox-agent/server/client-config"
import { clientMaddoxScope } from "@/features/maddox-agent/server/sessions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/cliente/maddox/sessions/[id]/messages — grava e inicia o turno (resposta pelo stream). */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    const actor = await requireClientActor(req)
    await assertClientMaddoxEnabled(actor)
    const body = await parseBody(req, sendOpexMessageSchema)
    if (!body.ok) return body.response
    return created(await sendMaddoxMessage(params.id, body.data, actor.userId, clientMaddoxScope(actor)))
})
