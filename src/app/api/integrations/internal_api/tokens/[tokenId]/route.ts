import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { apiTokenUpdateSchema } from "@/features/integrations/api-tokens/schemas"
import { revokeApiToken, updateApiTokenScopes } from "@/features/integrations/api-tokens/service"

export const runtime = "nodejs"

/** PATCH /api/integrations/internal_api/tokens/{tokenId} — troca os escopos e a expiração (efeito imediato). */
export const PATCH = withRoute<{ tokenId: string }>(async ({ req, params }) => {
    const body = await parseBody(req, apiTokenUpdateSchema)
    if (!body.ok) return body.response
    return ok(await updateApiTokenScopes(getLocalUser().id, params.tokenId, body.data))
})

/** DELETE /api/integrations/internal_api/tokens/{tokenId} — revoga o token de sistema (não volta). */
export const DELETE = withRoute<{ tokenId: string }>(async ({ params }) => {
    await revokeApiToken(getLocalUser().id, params.tokenId)
    return ok({ revogado: true })
})
