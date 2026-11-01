import { created, ok } from "@/lib/api/responses"
import { parseBody } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import type { MemoryListScope } from "../agents"
import { memoryCreateSchema, memoryPatchSchema } from "../memory-text"
import { createAgentMemory, deleteAgentMemory, getAgentMemory, listAgentMemories, updateAgentMemory } from "./agent-memory-service"

/**
 * Handlers compartilhados das rotas de memórias (listas globais, por central e por cliente): o mesmo
 * contrato e o mesmo serviço, só muda o escopo resolvido pela rota. Toda gravação é do dono.
 */

export const listMemoriesRoute = async (agentId: string, scope: MemoryListScope = {}) => ok(await listAgentMemories(agentId, scope))

export async function createMemoryRoute(req: Request, agentId: string, scope: MemoryListScope = {}) {
    const body = await parseBody(req, memoryCreateSchema)
    if (!body.ok) return body.response
    return created(await createAgentMemory(agentId, body.data.texto, getLocalUser().id, { ...scope, categoria: body.data.categoria, fixada: body.data.fixada }))
}

export const getMemoryRoute = async (agentId: string, memoryId: string, scope: MemoryListScope = {}) => ok(await getAgentMemory(agentId, memoryId, scope))

export async function patchMemoryRoute(req: Request, agentId: string, memoryId: string, scope: MemoryListScope = {}) {
    const body = await parseBody(req, memoryPatchSchema)
    if (!body.ok) return body.response
    return ok(await updateAgentMemory(agentId, memoryId, body.data, getLocalUser().id, scope))
}

export const deleteMemoryRoute = async (agentId: string, memoryId: string, scope: MemoryListScope = {}) => ok(await deleteAgentMemory(agentId, memoryId, getLocalUser().id, scope))
