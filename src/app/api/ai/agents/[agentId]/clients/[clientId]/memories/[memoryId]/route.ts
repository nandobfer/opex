import { withRoute } from "@/lib/api/route"
import { deleteMemoryRoute, getMemoryRoute, patchMemoryRoute } from "@/features/ai/server/memory-routes"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { agentId: string; clientId: string; memoryId: string }

/** GET /api/ai/agents/[agentId]/clients/[clientId]/memories/[memoryId] — uma memória do cliente. */
export const GET = withRoute<Params>(async ({ params }) => getMemoryRoute(params.agentId, params.memoryId, { clientId: params.clientId }))

/** PATCH — texto/categoria (com a versão lida), fixar e ativar/inativar. */
export const PATCH = withRoute<Params>(async ({ req, params }) => patchMemoryRoute(req, params.agentId, params.memoryId, { clientId: params.clientId }))

/** DELETE — exclui de vez no Engramind. */
export const DELETE = withRoute<Params>(async ({ params }) => deleteMemoryRoute(params.agentId, params.memoryId, { clientId: params.clientId }))
