import { DomainError } from "@/lib/api/route"
import { RoutineEntry } from "@/lib/db/models/RoutineAgent"
import { ROUTINE_GLOBAL_CHANNEL, routineChannelOf } from "../constants"
import type { RoutineEntryInput } from "../schemas"
import type { RoutineEntryDto } from "../types"
import { AcaoAuditoria, auditAgent, loadAgentDoc, messageOf, publishAgentUpdated, routineLog } from "./shared"

/**
 * Entradas do dono (OPE-130, não é chat): cada entrada grava **uma memória** no canal escolhido — "Este
 * agente" (`agentes/rotineiros/<slug>`) ou "Todos os rotineiros" (`agentes/rotineiros/global`) — e as
 * próximas execuções passam a considerá-la. Editar ou arquivar é na aba Memórias.
 */

export async function listRoutineEntries(agentId: string): Promise<RoutineEntryDto[]> {
    const agent = await loadAgentDoc(agentId)
    const rows = await RoutineEntry.find({ agentId: agent._id }).sort({ createdAt: -1 }).limit(200).lean()
    return rows.map((row) => ({ id: String(row._id), target: row.target, channel: row.channel, text: row.text, memoryId: row.memoryId ?? null, createdAt: new Date(row.createdAt).toISOString() }))
}

export async function addRoutineEntry(agentId: string, input: RoutineEntryInput, actorId: string): Promise<RoutineEntryDto> {
    const agent = await loadAgentDoc(agentId)
    const { createAgentMemory } = await import("@/features/ai/server/agent-memory-service")
    let memoryId: string
    try {
        const result = await createAgentMemory(input.target === "agent" ? "routine-specific" : "routine-global", input.text, actorId, {
            ...(input.target === "agent" ? { routineSlug: agent.slug } : {}),
            auditContext: { entradaRotineiro: String(agent._id) },
        })
        memoryId = result.memoria.id
    } catch (error) {
        if (error instanceof DomainError && error.status < 500) throw error
        routineLog.warn({ agentId, err: messageOf(error) }, "[routine-agents] entrada não gravada no Engramind")
        throw new DomainError(503, `Não foi possível gravar a entrada no Engramind: ${messageOf(error)}`, "ENGRAMIND_UNAVAILABLE")
    }
    const channel = input.target === "agent" ? routineChannelOf(agent.slug) : ROUTINE_GLOBAL_CHANNEL
    const row = await RoutineEntry.create({ agentId: agent._id, target: input.target, channel, text: input.text, memoryId })
    await auditAgent(actorId, agentId, AcaoAuditoria.CRIAR, { depois: { evento: "entrada", canal: channel, memoria: memoryId } })
    await publishAgentUpdated(agentId)
    return { id: String(row._id), target: row.target, channel, text: row.text, memoryId, createdAt: new Date(row.createdAt).toISOString() }
}
