import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { taskTagsSettingsSchema } from "@/features/ai/schemas"
import { getTaskTagsSettings, saveTaskTagsSettings } from "@/features/ai/server/settings"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/ai/features/task-tags — configuração de "Tags de tarefas" (provedor, taxonomia) e disponibilidade. */
export const GET = withRoute(async () => ok(await getTaskTagsSettings()))

/**
 * PUT /api/ai/features/task-tags — salva (confere provedor, modelo, variante, agente e a taxonomia).
 * Ao ativar, dispara em segundo plano a varredura das tarefas não concluídas sem tags.
 */
export const PUT = withRoute(async ({ req }) => {
    const body = await parseBody(req, taskTagsSettingsSchema)
    if (!body.ok) return body.response
    return ok(await saveTaskTagsSettings(body.data, getLocalUser().id))
})
