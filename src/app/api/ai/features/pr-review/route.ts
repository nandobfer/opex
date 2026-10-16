import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { prReviewSettingsSchema } from "@/features/pr-review/schemas"
import { getPrReviewSettings, savePrReviewSettings } from "@/features/ai/server/settings"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/ai/features/pr-review — configuração da "Revisão de PR" e se pode ser usada. */
export const GET = withRoute(async () => ok(await getPrReviewSettings()))

/** PUT /api/ai/features/pr-review — salva (confere modelo, agente e variante no OpenCode). */
export const PUT = withRoute(async ({ req }) => {
    const body = await parseBody(req, prReviewSettingsSchema)
    if (!body.ok) return body.response
    return ok(await savePrReviewSettings(body.data, getLocalUser().id))
})
