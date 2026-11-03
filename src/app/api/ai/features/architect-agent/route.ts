import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { architectSettingsSchema } from "@/features/architect-agent/schemas"
import { getArchitectSettings, saveArchitectSettings } from "@/features/architect-agent/server/settings"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/ai/features/architect-agent — configuração do Agente Arquiteto e se pode ser usado. */
export const GET = withRoute(async () => ok(await getArchitectSettings()))

/** PUT /api/ai/features/architect-agent — salva (confere no catálogo o modelo do OpenCode). */
export const PUT = withRoute(async ({ req }) => {
    const body = await parseBody(req, architectSettingsSchema)
    if (!body.ok) return body.response
    return ok(await saveArchitectSettings(body.data, getLocalUser().id))
})
