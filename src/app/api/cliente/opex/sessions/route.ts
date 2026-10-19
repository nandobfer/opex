import { created, ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requireClientActor } from "@/features/auth/server/context"
import { createOpexSessionSchema } from "@/features/opex-agent/schemas"
import { assertClientOpexEnabled } from "@/features/opex-agent/server/client-config"
import { sendMessage } from "@/features/opex-agent/server/runner"
import { createSession, listSessions } from "@/features/opex-agent/server/sessions"
import { clientOpexScope } from "@/features/opex-agent/server/scope"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/cliente/opex/sessions — sessões do **usuário** neste cliente. */
export const GET = withRoute(async ({ req }) => {
    const actor = await requireClientActor(req)
    await assertClientOpexEnabled(actor)
    return ok(await listSessions(clientOpexScope(actor)))
})

/** POST /api/cliente/opex/sessions — cria a sessão e, com `text`, já envia a primeira mensagem. */
export const POST = withRoute(async ({ req }) => {
    const actor = await requireClientActor(req)
    await assertClientOpexEnabled(actor)
    const body = await parseBody(req, createOpexSessionSchema)
    if (!body.ok) return body.response
    const scope = clientOpexScope(actor)
    const session = await createSession(actor.userId, scope)
    const message = body.data.text ? await sendMessage(session.id, { text: body.data.text }, actor.userId, scope) : null
    return created({ session, message })
})
