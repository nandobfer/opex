import { created } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requireClientActor } from "@/features/auth/server/context"
import { sendOpexMessageSchema } from "@/features/opex-agent/schemas"
import { assertClientOpexEnabled } from "@/features/opex-agent/server/client-config"
import { sendMessage } from "@/features/opex-agent/server/runner"
import { clientOpexScope } from "@/features/opex-agent/server/scope"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/cliente/opex/sessions/[id]/messages — grava e inicia o turno (resposta pelo stream). */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    const actor = await requireClientActor(req)
    await assertClientOpexEnabled(actor)
    const body = await parseBody(req, sendOpexMessageSchema)
    if (!body.ok) return body.response
    return created(await sendMessage(params.id, body.data, actor.userId, clientOpexScope(actor)))
})
