import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { taskRefinementSettingsSchema } from "@/features/ai/schemas"
import { getTaskRefinementSettings, saveTaskRefinementSettings } from "@/features/ai/server/settings"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/ai/features/task-refinement — configuração da feature "Refinar tarefa" e se pode ser usada. */
export const GET = withRoute(async () => ok(await getTaskRefinementSettings()))

/** PUT /api/ai/features/task-refinement — salva (confere modelo e agente do OpenCode). */
export const PUT = withRoute(async ({ req }) => {
    const body = await parseBody(req, taskRefinementSettingsSchema)
    if (!body.ok) return body.response
    return ok(await saveTaskRefinementSettings(body.data, getLocalUser().id))
})
