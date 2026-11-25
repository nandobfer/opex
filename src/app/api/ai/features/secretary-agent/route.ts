import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { requireAdminSession } from "@/features/auth/server/context"
import { secretarySettingsSchema } from "@/features/secretary-agent/schemas"
import { getSecretarySettings, saveSecretarySettings } from "@/features/secretary-agent/server/settings"

export const GET = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    return ok(await getSecretarySettings())
})

export const PUT = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    const body = await parseBody(req, secretarySettingsSchema)
    if (!body.ok) return body.response
    return ok(await saveSecretarySettings(body.data, getLocalUser().id))
})
