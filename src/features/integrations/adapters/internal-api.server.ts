import { okResponse, parseBody, route } from "@nandobfer/integracoes/server"
import { internalApiServer } from "@nandobfer/integracoes/internal-api/server"
import { apiTokenInputSchema, apiTokenUpdateSchema } from "@/features/integrations/api-tokens/schemas"

const tokens = () => import("@/features/integrations/api-tokens/service")

/** API interna da biblioteca + extensão do Opex: tokens de sistema e o catálogo de escopos (`/api/integrations/internal_api/*`). */
export const internalApiAdapter = internalApiServer({
    routes: [
        /** Escopos que um token pode receber (rotas e ferramentas do MCP do dono). */
        route("GET", "internal_api/scopes", async () => okResponse(await (await import("@/features/integrations/api-tokens/scope-catalog")).apiTokenScopeCatalog())),
        /** Tokens de sistema ativos (sem o valor). */
        route("GET", "internal_api/tokens", async () => okResponse(await (await tokens()).listApiTokens())),
        /** Gera um token de sistema; o valor só vem nesta resposta. */
        route("POST", "internal_api/tokens", async ({ request, actor }) => {
            const body = await parseBody(request, apiTokenInputSchema)
            if (!body.ok) return body.response
            return okResponse(await (await tokens()).createApiToken(actor.id, body.data), { status: 201 })
        }),
        /** Troca os escopos e a expiração (efeito imediato). */
        route("PATCH", "internal_api/tokens/:tokenId", async ({ request, params, actor }) => {
            const body = await parseBody(request, apiTokenUpdateSchema)
            if (!body.ok) return body.response
            return okResponse(await (await tokens()).updateApiTokenScopes(actor.id, params.tokenId!, body.data))
        }),
        /** Revoga o token de sistema (não volta). */
        route("DELETE", "internal_api/tokens/:tokenId", async ({ params, actor }) => {
            await (await tokens()).revokeApiToken(actor.id, params.tokenId!)
            return okResponse({ revogado: true })
        }),
    ],
})
