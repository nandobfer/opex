import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { taskSummarySettingsSchema } from "@/features/ai/schemas"
import { getTaskSummarySettings, saveTaskSummarySettings } from "@/features/ai/server/settings"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/ai/features/task-summary — configuração de "Resumos de tarefas" e se pode ser usada. */
export const GET = withRoute(async () => ok(await getTaskSummarySettings()))

/**
 * PUT /api/ai/features/task-summary — salva (confere provedor, modelo, variante e agente). Ao
 * ativar, dispara em segundo plano a varredura das tarefas não concluídas sem resumo.
 */
export const PUT = withRoute(async ({ req }) => {
    const body = await parseBody(req, taskSummarySettingsSchema)
    if (!body.ok) return body.response
    return ok(await saveTaskSummarySettings(body.data, getLocalUser().id))
})
