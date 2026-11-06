import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { requireAdminSession } from "@/features/auth/server/context"
import { routineAgentSettingsSchema } from "@/features/routine-agents/schemas"
import { loadRoutineAgentSettings, saveRoutineAgentSettings } from "@/features/routine-agents/server/settings"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/routine-agents/settings — modelo do subagente de provisionamento. */
export const GET = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    return ok(await loadRoutineAgentSettings())
})

export const PUT = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    const body = await parseBody(req, routineAgentSettingsSchema)
    if (!body.ok) return body.response
    return ok(await saveRoutineAgentSettings(body.data, getLocalUser().id))
})
