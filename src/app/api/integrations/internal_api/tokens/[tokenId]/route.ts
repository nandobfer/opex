import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { revokeApiToken } from "@/features/integrations/api-tokens/service"

export const runtime = "nodejs"

/** DELETE /api/integrations/internal_api/tokens/{tokenId} — revoga o token de sistema (não volta). */
export const DELETE = withRoute<{ tokenId: string }>(async ({ params }) => {
    await revokeApiToken(getLocalUser().id, params.tokenId)
    return ok({ revogado: true })
})
