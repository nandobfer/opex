import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { selfMemorySettingsSchema } from "@/features/ai/self-memory"
import { getSelfMemorySettings, saveSelfMemorySettings } from "@/features/ai/server/self-memory/settings"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/ai/features/agent-self-memory — "Aprendizado autônomo" por agente. */
export const GET = withRoute(async () => ok(await getSelfMemorySettings()))

/** PUT — liga/desliga o aprendizado autônomo de cada agente (auditado). */
export const PUT = withRoute(async ({ req }) => {
    const body = await parseBody(req, selfMemorySettingsSchema)
    if (!body.ok) return body.response
    return ok(await saveSelfMemorySettings(body.data, getLocalUser().id))
})
