import { withRoute } from "@/lib/api/route"
import { createMemoryRoute, listMemoriesRoute } from "@/features/ai/server/memory-routes"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { agentId: string; clientId: string }

/** GET /api/ai/agents/[agentId]/clients/[clientId]/memories — memórias de um cliente específico. */
export const GET = withRoute<Params>(async ({ params }) => listMemoriesRoute(params.agentId, { clientId: params.clientId }))

/** POST — nova memória do cliente (`{ texto, categoria?, fixada? }`). */
export const POST = withRoute<Params>(async ({ req, params }) => createMemoryRoute(req, params.agentId, { clientId: params.clientId }))
