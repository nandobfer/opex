import { withRoute } from "@/lib/api/route"
import { handleAgentMemoryMcpRequest } from "@/features/ai/server/self-memory/mcp"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/agent-memory/mcp — MCP "Memória própria" dos agentes no OpenCode (Maddox, desenvolvedor e
 * Adversário). Sem sessão de navegador: autenticado pelo segredo derivado da chave das integrações, com
 * o agente resolvido pela sessão do OpenCode em cada `tools/call`. Não faz parte da API pública por token.
 */
export const POST = withRoute(async ({ req }) => handleAgentMemoryMcpRequest(req))

/** GET/DELETE — transporte sem estado. */
export const GET = withRoute(async () => new Response(null, { status: 405, headers: { Allow: "POST" } }))
export const DELETE = withRoute(async () => new Response(null, { status: 405, headers: { Allow: "POST" } }))
