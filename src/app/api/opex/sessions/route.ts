import { created, ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { createOpexSessionSchema } from "@/features/opex-agent/schemas"
import { sendMessage } from "@/features/opex-agent/server/runner"
import { createSession, listSessions } from "@/features/opex-agent/server/sessions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/opex/sessions — sessões do Agente Opex, da mais recente para a mais antiga. */
export const GET = withRoute(async () => ok(await listSessions()))

/** POST /api/opex/sessions — cria a sessão e, com `text`, já envia a primeira mensagem. */
export const POST = withRoute(async ({ req }) => {
    const body = await parseBody(req, createOpexSessionSchema)
    if (!body.ok) return body.response
    const actorId = getLocalUser().id
    const session = await createSession(actorId)
    const message = body.data.text ? await sendMessage(session.id, { text: body.data.text }, actorId) : null
    return created({ session, message })
})
