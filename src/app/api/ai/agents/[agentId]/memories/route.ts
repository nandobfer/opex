import { withRoute } from "@/lib/api/route"
import { createMemoryRoute, listMemoriesRoute } from "@/features/ai/server/memory-routes"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/ai/agents/[agentId]/memories — memórias de uma lista (canal do Engramind), ativas e inativas. */
export const GET = withRoute<{ agentId: string }>(async ({ params }) => listMemoriesRoute(params.agentId))

/** POST /api/ai/agents/[agentId]/memories — nova memória (`{ texto, categoria?, fixada? }`). */
export const POST = withRoute<{ agentId: string }>(async ({ req, params }) => createMemoryRoute(req, params.agentId))
