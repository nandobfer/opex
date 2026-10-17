import { withRoute, parseBody } from "@/lib/api/route"
import { ok } from "@/lib/api/responses"
import { requireAdminSession } from "@/features/auth/server/context"
import { getLocalUser } from "@/lib/local-user"
import { environmentSettingsSchema } from "@/features/environments/schemas"
import { getEnvironmentSettings, saveEnvironmentSettings } from "@/features/ai/server/settings"
export const GET = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    return ok(await getEnvironmentSettings())
})
export const PUT = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    const body = await parseBody(req, environmentSettingsSchema)
    if (!body.ok) return body.response
    return ok(await saveEnvironmentSettings(body.data, getLocalUser().id))
})
