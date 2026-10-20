import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { memorySummarySettingsSchema } from "@/features/ai/schemas"
import { getMemorySummarySettings, saveMemorySummarySettings } from "@/features/ai/server/memory-summary"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/ai/features/memory-summary — configuração do uso "Resumo de memórias" e se pode ser usado. */
export const GET = withRoute(async () => ok(await getMemorySummarySettings()))

/** PUT /api/ai/features/memory-summary — salva (confere provedor, modelo e variante no catálogo). */
export const PUT = withRoute(async ({ req }) => {
    const body = await parseBody(req, memorySummarySettingsSchema)
    if (!body.ok) return body.response
    return ok(await saveMemorySummarySettings(body.data, getLocalUser().id))
})
