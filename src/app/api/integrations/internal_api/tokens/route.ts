import { created, ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { apiTokenInputSchema } from "@/features/integrations/api-tokens/schemas"
import { createApiToken, listApiTokens } from "@/features/integrations/api-tokens/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/integrations/internal_api/tokens — tokens de sistema ativos (sem o valor). */
export const GET = withRoute(async () => ok(await listApiTokens()))

/** POST /api/integrations/internal_api/tokens — gera um token de sistema; o valor só vem nesta resposta. */
export const POST = withRoute(async ({ req }) => {
    const body = await parseBody(req, apiTokenInputSchema)
    if (!body.ok) return body.response
    return created(await createApiToken(getLocalUser().id, body.data))
})
