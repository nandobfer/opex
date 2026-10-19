import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { opexAgentSettingsSchema } from "@/features/opex-agent/schemas"
import { getOpexSettings, saveOpexSettings } from "@/features/opex-agent/server/settings"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/ai/features/opex-agent — configuração do Agente Opex e se pode ser usado. */
export const GET = withRoute(async () => ok(await getOpexSettings()))

/** PUT /api/ai/features/opex-agent — salva (confere provedores, modelos e variantes no catálogo). */
export const PUT = withRoute(async ({ req }) => {
    const body = await parseBody(req, opexAgentSettingsSchema)
    if (!body.ok) return body.response
    return ok(await saveOpexSettings(body.data, getLocalUser().id))
})
