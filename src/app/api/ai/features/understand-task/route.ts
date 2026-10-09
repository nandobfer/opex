import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { understandTaskSettingsSchema } from "@/features/ai/schemas"
import { getUnderstandTaskSettings, saveUnderstandTaskSettings } from "@/features/ai/server/settings"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/ai/features/understand-task — configuração de "Entender tarefas" e se pode ser usada. */
export const GET = withRoute(async () => ok(await getUnderstandTaskSettings()))

/** PUT /api/ai/features/understand-task — salva (confere provedor, modelo, variante e agente). */
export const PUT = withRoute(async ({ req }) => {
    const body = await parseBody(req, understandTaskSettingsSchema)
    if (!body.ok) return body.response
    return ok(await saveUnderstandTaskSettings(body.data, getLocalUser().id))
})
