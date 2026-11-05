import { withRoute } from "@/lib/api/route"
import { handleRoutineRunMcpRequest } from "@/features/routine-agents/server/mcp"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/routine-agents/mcp/[runId] — MCP de uma execução de agente rotineiro (motor OpenCode). Sem
 * sessão de navegador: autenticado pelo segredo da execução. Não faz parte da API pública por token.
 */
export const POST = withRoute<{ runId: string }>(async ({ req, params }) => handleRoutineRunMcpRequest(params.runId, req))

export const GET = withRoute<{ runId: string }>(async () => new Response(null, { status: 405, headers: { Allow: "POST" } }))
export const DELETE = withRoute<{ runId: string }>(async () => new Response(null, { status: 405, headers: { Allow: "POST" } }))
