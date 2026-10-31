import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requireApiToken } from "@/features/integrations/api-tokens/service"
import { publicRouteScope } from "@/features/public-api/routes"
import type { WhoAmIResponse } from "@/features/public-api/schemas"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/v1/whoami — endpoint PÚBLICO por token de sistema (documentado em
 * `src/features/public-api/openapi/spec.ts`). Livre para qualquer token válido: responde quem ele é,
 * os escopos e a expiração.
 */
export const GET = withRoute(async ({ req }) => {
    const token = await requireApiToken(req, { scope: publicRouteScope("/api/v1/whoami") })
    return ok<WhoAmIResponse>({ token: { id: token.id, nome: token.nome, prefixo: token.prefixo, escopos: token.escopos, legado: token.legado, expiraEm: token.expiraEm } })
})
