import { created, ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { createMaddoxSessionSchema } from "@/features/maddox-agent/schemas"
import { createMaddoxSession, MADDOX_OWNER_SCOPE } from "@/features/maddox-agent/server/sessions"
import { listSessions } from "@/features/opex-agent/server/sessions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/maddox/sessions — sessões do Agente Maddox do dono, da mais recente para a mais antiga. */
export const GET = withRoute(async () => ok(await listSessions(MADDOX_OWNER_SCOPE)))

/** POST /api/maddox/sessions — cria a sessão (com o modelo escolhido, opcional) e, com `text`, já envia a primeira mensagem. */
export const POST = withRoute(async ({ req }) => {
    const body = await parseBody(req, createMaddoxSessionSchema)
    if (!body.ok) return body.response
    return created(await createMaddoxSession(body.data, getLocalUser().id, MADDOX_OWNER_SCOPE))
})
