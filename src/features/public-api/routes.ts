/**
 * Rotas públicas por token de sistema (módulo PURO) com o escopo que cada uma exige. `scope: null` =
 * qualquer token válido (inclusive o legado e o só de MCP). A rota lê o escopo daqui
 * (`publicRouteScope`) e a especificação OpenAPI documenta a partir daqui.
 *
 * REGRA (AGENTS.md): criar, alterar ou remover uma rota pública exige atualizar esta lista e a
 * especificação (`openapi/spec.ts`) no mesmo commit.
 */
export interface PublicTokenRoute {
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
    path: string
    scope: string | null
    summary: string
}

export const PUBLIC_TOKEN_ROUTES = [
    { method: "GET", path: "/api/v1/whoami", scope: null, summary: "Confere o token" },
    // Webhook externo dos agentes rotineiros (OPE-130): dispara uma execução nova.
    { method: "POST", path: "/api/v1/routine-agents/{id}/runs", scope: "api:v1:routine-agents", summary: "Dispara uma execução de um agente rotineiro" },
] as const satisfies readonly PublicTokenRoute[]

export type PublicTokenRoutePath = (typeof PUBLIC_TOKEN_ROUTES)[number]["path"]

export function publicRouteScope(path: PublicTokenRoutePath): string | null {
    return PUBLIC_TOKEN_ROUTES.find((route) => route.path === path)?.scope ?? null
}

/** Nome do esquema de segurança do token de sistema na especificação OpenAPI. */
export const API_TOKEN_SECURITY_SCHEME = "apiToken"
