import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { environmentsSettingsSchema } from "@/features/environments/schemas"
import { getEnvironmentsSettings, saveEnvironmentsSettings } from "@/features/environments/server/settings"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const GET = withRoute(async () => {
    return ok(await getEnvironmentsSettings())
})

/** PUT /api/environments/settings — pasta base, porta do registry e quantas tags manter. */
export const PUT = withRoute(async ({ req }) => {
    const body = await parseBody(req, environmentsSettingsSchema)
    if (!body.ok) return body.response
    return ok(await saveEnvironmentsSettings(body.data, getLocalUser().id))
})
