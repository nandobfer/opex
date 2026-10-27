import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { adversarialSettingsSchema } from "@/features/adversarial-agent/schemas"
import { getAdversarialSettings, saveAdversarialSettings } from "@/features/adversarial-agent/server/settings"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/ai/features/adversarial-agent — configuração do Agente Adversário e se pode ser usado. */
export const GET = withRoute(async () => ok(await getAdversarialSettings()))

/** PUT /api/ai/features/adversarial-agent — salva (confere no catálogo o modelo do OpenCode). */
export const PUT = withRoute(async ({ req }) => {
    const body = await parseBody(req, adversarialSettingsSchema)
    if (!body.ok) return body.response
    return ok(await saveAdversarialSettings(body.data, getLocalUser().id))
})
