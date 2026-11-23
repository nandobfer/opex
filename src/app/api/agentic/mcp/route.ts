import { withRoute } from "@/lib/api/route"
import { handleWorkbenchMcpRequest } from "@/features/agentic/server/workbench-mcp/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/agentic/mcp — MCP "Mesa do Opex" (OPE-178), somente leitura, para o agente da mesa e dos
 * forks no OpenCode. Sem sessão de navegador: autenticado pelo segredo derivado da chave das integrações,
 * com a mesa resolvida pela sessão do OpenCode em cada `tools/call`. Não faz parte da API pública por token.
 */
export const POST = withRoute(async ({ req }) => handleWorkbenchMcpRequest(req))

/** GET/DELETE — transporte sem estado. */
export const GET = withRoute(async () => new Response(null, { status: 405, headers: { Allow: "POST" } }))
export const DELETE = withRoute(async () => new Response(null, { status: 405, headers: { Allow: "POST" } }))
