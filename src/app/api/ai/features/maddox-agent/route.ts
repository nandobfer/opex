import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { maddoxAgentSettingsSchema } from "@/features/maddox-agent/schemas"
import { getMaddoxSettings, saveMaddoxSettings } from "@/features/maddox-agent/server/settings"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/ai/features/maddox-agent — configuração do Agente Maddox (+ ferramentas do Opex e disponibilidade). */
export const GET = withRoute(async () => ok(await getMaddoxSettings()))

/** PUT /api/ai/features/maddox-agent — salva (modelo conferido no catálogo do OpenCode) e registra o MCP do Opex. */
export const PUT = withRoute(async ({ req }) => {
    const body = await parseBody(req, maddoxAgentSettingsSchema)
    if (!body.ok) return body.response
    return ok(await saveMaddoxSettings(body.data, getLocalUser().id))
})
