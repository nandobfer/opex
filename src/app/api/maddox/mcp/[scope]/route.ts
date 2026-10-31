import { withRoute } from "@/lib/api/route"
import { handleMaddoxMcpRequest } from "@/features/maddox-agent/server/mcp-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { scope: string }

const SCOPES = ["owner", "portal"] as const

/**
 * POST /api/maddox/mcp/{owner|portal} — servidor MCP do Opex para o OpenCode (Agente Maddox).
 * Rota sem sessão de navegador: autenticada pelo segredo derivado da chave das integrações, com o
 * escopo da sessão do Maddox conferido em cada `tools/call`. Não faz parte da API pública por token.
 */
export const POST = withRoute<Params>(async ({ req, params }) => {
    const scope = SCOPES.find((item) => item === params.scope)
    if (!scope) return Response.json({ error: "Servidor MCP desconhecido" }, { status: 404 })
    return handleMaddoxMcpRequest(scope, req)
})

/** GET/DELETE — sem stream nem sessão no servidor (transporte sem estado). */
export const GET = withRoute<Params>(async () => new Response(null, { status: 405, headers: { Allow: "POST" } }))
export const DELETE = withRoute<Params>(async () => new Response(null, { status: 405, headers: { Allow: "POST" } }))
