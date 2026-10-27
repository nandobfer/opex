import { Types } from "mongoose"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { AgentMemory, type IAgentMemory } from "@/lib/db/models/AgentMemory"
import { DomainError } from "@/lib/api/route"
import { getLocalUser, LOCAL_USER_ID } from "@/lib/local-user"
import { loggerFor } from "@/lib/logger"
import { integrationChannel } from "@/lib/pusher/channel-names"
import { publishToChannels } from "@/lib/pusher/channels"
import { AI_AGENTS, isAiAgentId, type AiAgentId } from "../agents"
import { AGENT_MEMORY_LIMIT, AI_MEMORIES_UPDATED_EVENT, AI_MEMORY_AUDIT_ENTITY } from "../constants"
import { memoryInputSchema } from "../schemas"
import type { MemoryDto, MemoryMutationResult } from "../types"
import { formatMemory } from "./memory-summary"

/**
 * Memórias (instruções permanentes) dos agentes de IA, uma lista por item do catálogo `agents.ts`.
 * Criar e editar passam pelo uso "Resumo de memórias" (texto formatado + resumo de uma linha).
 * Excluir remove (a auditoria guarda o texto). Até 50 por lista. Copiado do Ciliar, sem permissões:
 * toda ação é do dono (usuário local), pela tela ou pelas ferramentas do Agente Opex.
 */

export function assertAgentId(agentId: string): AiAgentId {
    if (!isAiAgentId(agentId)) throw new DomainError(404, "Agente não encontrado", "AI_AGENT_NOT_FOUND")
    return agentId
}

/** Nome do autor: o dono (usuário local) é o único autor possível no app do dono. */
function authorName(userId: string): string | null {
    return userId === LOCAL_USER_ID ? getLocalUser().name : null
}

export function toMemoryDto(memory: Pick<IAgentMemory, "_id" | "texto" | "resumo" | "createdAt" | "updatedAt" | "updatedBy">): MemoryDto {
    return {
        id: String(memory._id),
        texto: memory.texto,
        resumo: memory.resumo,
        autor: authorName(memory.updatedBy),
        criadaEm: new Date(memory.createdAt).toISOString(),
        atualizadaEm: new Date(memory.updatedAt).toISOString(),
    }
}

async function publish(agentId: AiAgentId) {
    await publishToChannels([integrationChannel("ai")], AI_MEMORIES_UPDATED_EVENT, { agentId }).catch(() => undefined)
}

export async function listAgentMemories(agentId: string): Promise<MemoryDto[]> {
    const agent = assertAgentId(agentId)
    await dbConnect()
    const rows = (await AgentMemory.find({ agentId: agent }).sort({ createdAt: -1 }).limit(AGENT_MEMORY_LIMIT).lean()) as IAgentMemory[]
    return rows.map(toMemoryDto)
}

export async function getAgentMemory(agentId: string, id: string): Promise<MemoryDto> {
    return toMemoryDto(await findMemory(assertAgentId(agentId), id))
}

/** Textos das memórias para o prompt do agente (por lista, em ordem de criação). */
export async function agentMemoryTexts(agentIds: readonly AiAgentId[]): Promise<string[]> {
    if (!agentIds.length) return []
    await dbConnect()
    const rows = await AgentMemory.find({ agentId: { $in: [...agentIds] } })
        .sort({ createdAt: 1 })
        .select("agentId texto")
        .lean()
    // Uma lista depois da outra, na ordem pedida (ex.: globais antes das do dono), até o limite de cada.
    return agentIds.flatMap((agentId) =>
        rows
            .filter((row) => row.agentId === agentId)
            .slice(0, AGENT_MEMORY_LIMIT)
            .map((row) => row.texto),
    )
}

export { memoriesSection } from "../memories-prompt"

function parseText(texto: string): string {
    const parsed = memoryInputSchema.safeParse({ texto })
    if (!parsed.success) throw new DomainError(400, parsed.error.issues[0]?.message ?? "Memória inválida", "VALIDATION_ERROR")
    return parsed.data.texto
}

export async function createAgentMemory(agentId: string, texto: string, actorId: string): Promise<MemoryMutationResult> {
    const agent = assertAgentId(agentId)
    const input = parseText(texto)
    await dbConnect()
    if ((await AgentMemory.countDocuments({ agentId: agent })) >= AGENT_MEMORY_LIMIT) {
        throw new DomainError(409, `Limite de ${AGENT_MEMORY_LIMIT} memórias atingido. Exclua uma antes de adicionar outra.`, "MEMORY_LIMIT")
    }
    const formatted = await formatMemory(input)
    const now = new Date()
    const memory = (await AgentMemory.create({ agentId: agent, texto: formatted.texto, resumo: formatted.resumo, createdBy: actorId, updatedBy: actorId, createdAt: now, updatedAt: now })).toObject() as IAgentMemory
    await recordAudit({ userId: actorId, entidade: AI_MEMORY_AUDIT_ENTITY, entidadeId: String(memory._id), acao: AcaoAuditoria.CRIAR, depois: { agente: agent, texto: memory.texto } })
    loggerFor({ userId: actorId }).info({ agentId: agent, formatadaPorIa: formatted.formatadaPorIa }, `[ai] Memória (${AI_AGENTS[agent].title}) criada`)
    await publish(agent)
    return { memoria: toMemoryDto(memory), formatadaPorIa: formatted.formatadaPorIa }
}

async function findMemory(agentId: AiAgentId, id: string): Promise<IAgentMemory> {
    if (!Types.ObjectId.isValid(id)) throw new DomainError(404, "Memória não encontrada", "NOT_FOUND")
    await dbConnect()
    const memory = (await AgentMemory.findOne({ agentId, _id: id }).lean()) as IAgentMemory | null
    if (!memory) throw new DomainError(404, "Memória não encontrada", "NOT_FOUND")
    return memory
}

export async function updateAgentMemory(agentId: string, id: string, texto: string, actorId: string): Promise<MemoryMutationResult> {
    const agent = assertAgentId(agentId)
    const input = parseText(texto)
    const current = await findMemory(agent, id)
    const formatted = await formatMemory(input)
    const updated = (await AgentMemory.findOneAndUpdate(
        { _id: current._id },
        { $set: { texto: formatted.texto, resumo: formatted.resumo, updatedBy: actorId, updatedAt: new Date() } },
        { returnDocument: "after" },
    ).lean()) as IAgentMemory
    await recordAudit({ userId: actorId, entidade: AI_MEMORY_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.ATUALIZAR, antes: { agente: agent, texto: current.texto }, depois: { agente: agent, texto: updated.texto } })
    await publish(agent)
    return { memoria: toMemoryDto(updated), formatadaPorIa: formatted.formatadaPorIa }
}

export async function deleteAgentMemory(agentId: string, id: string, actorId: string): Promise<MemoryDto> {
    const agent = assertAgentId(agentId)
    const current = await findMemory(agent, id)
    await AgentMemory.deleteOne({ _id: current._id })
    await recordAudit({ userId: actorId, entidade: AI_MEMORY_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.EXCLUIR, antes: { agente: agent, texto: current.texto } })
    await publish(agent)
    return toMemoryDto(current)
}
