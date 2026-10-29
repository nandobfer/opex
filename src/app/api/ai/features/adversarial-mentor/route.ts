import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { mentorSettingsSchema } from "@/features/adversarial-agent/mentor/schemas"
import { getMentorSettings, saveMentorSettings } from "@/features/adversarial-agent/server/mentor/settings"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/ai/features/adversarial-mentor — configuração do Agente Mentor. */
export const GET = withRoute(async () => ok(await getMentorSettings()))

/** PUT /api/ai/features/adversarial-mentor — salva (confere no catálogo os modelos do decisor e do redator). */
export const PUT = withRoute(async ({ req }) => {
    const body = await parseBody(req, mentorSettingsSchema)
    if (!body.ok) return body.response
    return ok(await saveMentorSettings(body.data, getLocalUser().id))
})
