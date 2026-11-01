import { withRoute } from "@/lib/api/route"
import { deleteMemoryRoute, getMemoryRoute, patchMemoryRoute } from "@/features/ai/server/memory-routes"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { id: string; memoryId: string }

/** GET /api/agentic/centrals/[id]/memories/[memoryId] — uma memória da central. */
export const GET = withRoute<Params>(async ({ params }) => getMemoryRoute("developer-central", params.memoryId, { centralId: params.id }))

/** PATCH — texto/categoria (com a versão lida), fixar e ativar/inativar. */
export const PATCH = withRoute<Params>(async ({ req, params }) => patchMemoryRoute(req, "developer-central", params.memoryId, { centralId: params.id }))

/** DELETE — exclui de vez no Engramind. */
export const DELETE = withRoute<Params>(async ({ params }) => deleteMemoryRoute("developer-central", params.memoryId, { centralId: params.id }))
