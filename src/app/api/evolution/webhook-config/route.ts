import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { requireAdminSession } from "@/features/auth/server/context"
import { webhookUrlSchema } from "@/features/evolution-api/schemas"
import { evolutionConfig, getWebhook, registerWebhook, saveWebhookUrl, defaultInstanceName } from "@/features/evolution-api/server/instances"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/evolution/webhook-config — URL de entrada, segredo configurado (nunca o valor), eventos e o registro na instância. */
export const GET = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    const config = await evolutionConfig()
    return ok(await getWebhook(config.defaultInstance?.trim() || null))
})

/** PUT /api/evolution/webhook-config — troca a URL de entrada e registra de novo na instância padrão. */
export const PUT = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    const body = await parseBody(req, webhookUrlSchema)
    if (!body.ok) return body.response
    return ok(await saveWebhookUrl(body.data.url, getLocalUser().id))
})

/** POST /api/evolution/webhook-config — "Registrar na instância" (`/webhook/set/{instance}`). */
export const POST = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    return ok(await registerWebhook(await defaultInstanceName(), getLocalUser().id))
})
