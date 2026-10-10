import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { estimateHoursSettingsSchema } from "@/features/ai/schemas"
import { getEstimateHoursSettings, saveEstimateHoursSettings } from "@/features/ai/server/settings"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/ai/features/estimate-hours — configuração da feature "Estimar prazos" e se pode ser usada. */
export const GET = withRoute(async () => ok(await getEstimateHoursSettings()))

/** PUT /api/ai/features/estimate-hours — salva (confere modelo e agente do OpenCode). */
export const PUT = withRoute(async ({ req }) => {
    const body = await parseBody(req, estimateHoursSettingsSchema)
    if (!body.ok) return body.response
    return ok(await saveEstimateHoursSettings(body.data, getLocalUser().id))
})
