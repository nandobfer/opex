import { created, ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { memoryInputSchema } from "@/features/ai/schemas"
import { createAgentMemory, listAgentMemories } from "@/features/ai/server/agent-memory-service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/agentic/centrals/[id]/memories — memórias do agente desenvolvedor desta central. */
export const GET = withRoute<{ id: string }>(async ({ params }) => ok(await listAgentMemories("developer-central", params.id)))

/** POST /api/agentic/centrals/[id]/memories — nova memória da central, formatada pelo Resumo de memórias. */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    const body = await parseBody(req, memoryInputSchema)
    if (!body.ok) return body.response
    return created(await createAgentMemory("developer-central", body.data.texto, getLocalUser().id, { centralId: params.id }))
})
