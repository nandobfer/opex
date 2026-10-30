import { created, ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { createMaddoxSessionSchema } from "@/features/maddox-agent/schemas"
import { createMaddoxSession } from "@/features/maddox-agent/server/sessions"
import { listSessions } from "@/features/opex-agent/server/sessions"
import { requireClientActor } from "@/features/auth/server/context"
import { assertClientMaddoxEnabled } from "@/features/maddox-agent/server/client-config"
import { clientMaddoxScope } from "@/features/maddox-agent/server/sessions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/cliente/maddox/sessions — sessões do Maddox do **usuário** neste cliente. */
export const GET = withRoute(async ({ req }) => {
    const actor = await requireClientActor(req)
    await assertClientMaddoxEnabled(actor)
    return ok(await listSessions(clientMaddoxScope(actor)))
})

/** POST /api/cliente/maddox/sessions — cria a sessão e, com `text`, já envia a primeira mensagem. */
export const POST = withRoute(async ({ req }) => {
    const actor = await requireClientActor(req)
    await assertClientMaddoxEnabled(actor)
    const body = await parseBody(req, createMaddoxSessionSchema)
    if (!body.ok) return body.response
    return created(await createMaddoxSession(body.data, actor.userId, clientMaddoxScope(actor)))
})
