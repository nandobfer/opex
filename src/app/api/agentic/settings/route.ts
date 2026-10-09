import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { agenticSettingsSchema } from "@/features/agentic/schemas"
import { getAgenticSettings, saveAgenticSettings } from "@/features/agentic/server/settings"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/agentic/settings — configuração geral do desenvolvimento agêntico e disponibilidade. */
export const GET = withRoute(async () => ok(await getAgenticSettings()))

/** PUT /api/agentic/settings — liga/desliga e define os agentes padrão (conferidos no OpenCode). */
export const PUT = withRoute(async ({ req }) => {
    const body = await parseBody(req, agenticSettingsSchema)
    if (!body.ok) return body.response
    return ok(await saveAgenticSettings(body.data, getLocalUser().id))
})
