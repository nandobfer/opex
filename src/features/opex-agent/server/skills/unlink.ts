import { RoutineAgent } from "@/lib/db/models/RoutineAgent"
import { AcaoAuditoria, auditAgent, publishAgentUpdated } from "@/features/routine-agents/server/shared"
import type { OpexSkillUsageDto } from "../../skills"

/**
 * Vínculo das skills do Opex com os agentes rotineiros do motor Opex (`opex.enabledSkills`, por nome).
 * D6: ao remover a skill, ela sai da seleção de cada rotineiro, com auditoria e evento de tempo real.
 * Execuções em andamento seguem com o `snapshot` e recebem "skill indisponível" ao carregar.
 */

interface UsageDoc {
    _id: unknown
    name: string
    opex?: { enabledSkills?: string[] }
}

export async function routineAgentsUsingSkill(name: string): Promise<OpexSkillUsageDto> {
    const docs = await RoutineAgent.find({ "opex.enabledSkills": name }).select({ name: 1 }).sort({ name: 1 }).lean<UsageDoc[]>()
    return { count: docs.length, agents: docs.map((doc) => ({ id: String(doc._id), name: doc.name })) }
}

/** Tira a skill da seleção dos rotineiros. Devolve quantos foram alterados. */
export async function unlinkSkillFromRoutineAgents(name: string, actorId: string): Promise<number> {
    const docs = await RoutineAgent.find({ "opex.enabledSkills": name }).select({ name: 1, opex: 1 }).lean<UsageDoc[]>()
    for (const doc of docs) {
        const id = String(doc._id)
        const before = doc.opex?.enabledSkills ?? []
        await RoutineAgent.updateOne({ _id: doc._id }, { $pull: { "opex.enabledSkills": name } })
        await auditAgent(actorId, id, AcaoAuditoria.ATUALIZAR, { antes: { opex: { enabledSkills: before } }, depois: { opex: { enabledSkills: before.filter((item) => item !== name) }, motivo: `Skill "${name}" removida do Agente Opex` } })
        await publishAgentUpdated(id)
    }
    return docs.length
}
