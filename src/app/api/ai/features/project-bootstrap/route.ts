import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { projectBootstrapSettingsSchema } from "@/features/project-bootstrap/schemas"
import { getProjectBootstrapSettings, saveProjectBootstrapSettings } from "@/features/project-bootstrap/server/settings"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/ai/features/project-bootstrap — configuração do Agente de Bootstrap e se pode ser usado. */
export const GET = withRoute(async () => ok(await getProjectBootstrapSettings()))

/** PUT /api/ai/features/project-bootstrap — salva (confere no catálogo do OpenCode o agente e os modelos). */
export const PUT = withRoute(async ({ req }) => {
    const body = await parseBody(req, projectBootstrapSettingsSchema)
    if (!body.ok) return body.response
    return ok(await saveProjectBootstrapSettings(body.data, getLocalUser().id))
})
