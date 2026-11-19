import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { pluginVersionSummarySettingsSchema } from "@/features/ai/schemas"
import { getPluginVersionSummarySettings, savePluginVersionSummarySettings } from "@/features/ai/server/settings"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/ai/features/plugin-version-summary — configuração de "Descritivo de versão de plugin" e disponibilidade. */
export const GET = withRoute(async () => ok(await getPluginVersionSummarySettings()))

/** PUT /api/ai/features/plugin-version-summary — salva (confere provedor, modelo, variante e agente). */
export const PUT = withRoute(async ({ req }) => {
    const body = await parseBody(req, pluginVersionSummarySettingsSchema)
    if (!body.ok) return body.response
    return ok(await savePluginVersionSummarySettings(body.data, getLocalUser().id))
})
