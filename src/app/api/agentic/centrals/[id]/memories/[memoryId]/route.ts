import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { memoryInputSchema } from "@/features/ai/schemas"
import { deleteAgentMemory, getAgentMemory, updateAgentMemory } from "@/features/ai/server/agent-memory-service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { id: string; memoryId: string }

/** GET /api/agentic/centrals/[id]/memories/[memoryId] — uma memória da central. */
export const GET = withRoute<Params>(async ({ params }) => ok(await getAgentMemory("developer-central", params.memoryId, params.id)))

/** PATCH — edita o texto (reformatado pelo Resumo de memórias). */
export const PATCH = withRoute<Params>(async ({ req, params }) => {
    const body = await parseBody(req, memoryInputSchema)
    if (!body.ok) return body.response
    return ok(await updateAgentMemory("developer-central", params.memoryId, body.data.texto, getLocalUser().id, { centralId: params.id }))
})

/** DELETE — exclui (a auditoria guarda o texto). */
export const DELETE = withRoute<Params>(async ({ params }) => ok(await deleteAgentMemory("developer-central", params.memoryId, getLocalUser().id, params.id)))
