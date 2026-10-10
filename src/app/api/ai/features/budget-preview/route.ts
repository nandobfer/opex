import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { budgetPreviewSettingsSchema } from "@/features/ai/schemas"
import { getBudgetPreviewSettings, saveBudgetPreviewSettings } from "@/features/ai/server/settings"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/ai/features/budget-preview — configuração da feature "Orçamentos" e se pode ser usada. */
export const GET = withRoute(async () => ok(await getBudgetPreviewSettings()))

/** PUT /api/ai/features/budget-preview — salva (confere provedor, modelo, variante e agente). */
export const PUT = withRoute(async ({ req }) => {
    const body = await parseBody(req, budgetPreviewSettingsSchema)
    if (!body.ok) return body.response
    return ok(await saveBudgetPreviewSettings(body.data, getLocalUser().id))
})
