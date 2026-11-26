
import { memoryChannelOf, type AiAgentId } from "@/features/ai/agents"
import { enqueuePendingWrite, isEngramindUnavailable, type PendingOp } from "@/features/engramind/server/pending-writes"

/**
 * Gravações de memória do Agente Secretário com a fila de pendências (Engramind fora do ar): a ferramenta
 * devolve `pendente:<chave>` e a rotina `engramind-pending-writes` grava depois.
 */

export const SECRETARY_MEMORY_AGENT = { consumer: "secretario" as const, label: "Agente Secretário" }

const QUEUED_TOOLS = new Set(["remember", "update_my_memory", "set_my_memory_active"])

/** Escopo da lista do Secretário (o canal da conversa exige o id dela). */
export function secretaryListScope(list: AiAgentId, conversationId: string | null): { conversationId?: string } {
    return list === "secretary-conversation" && conversationId ? { conversationId } : {}
}

/** Converte a entrada da ferramenta na gravação pendente; `null` se a ferramenta não entra na fila. */
export function pendingOpOfTool(name: string, input: Record<string, unknown>): PendingOp | null {
    if (!QUEUED_TOOLS.has(name)) return null
    if (name === "remember" && typeof input.texto === "string") return { op: "create", texto: input.texto }
    if (typeof input.memoryId !== "string") return null
    if (name === "update_my_memory") return { op: "update", memoryId: input.memoryId, patch: { ...(typeof input.texto === "string" ? { texto: input.texto } : {}), ...(typeof input.categoria === "string" ? { categoria: input.categoria } : {}) } }
    if (name === "set_my_memory_active" && typeof input.ativa === "boolean") return { op: "update", memoryId: input.memoryId, patch: { ativa: input.ativa } }
    return null
}

/** Roda a gravação; com o Engramind fora do ar, enfileira e devolve o id pendente. */
export async function withPendingQueue<T>(input: { list: AiAgentId; conversationId: string | null; actorId: string; write: PendingOp | null }, run: () => Promise<T>): Promise<T | { pendente: true; id: string }> {
    try {
        return await run()
    } catch (error) {
        if (!input.write || !isEngramindUnavailable(error)) throw error
        const scope = secretaryListScope(input.list, input.conversationId)
        const channel = memoryChannelOf(input.list, scope)
        if (!channel) throw error
        const id = await enqueuePendingWrite({ channel, list: input.list, options: { ...scope, agent: SECRETARY_MEMORY_AGENT }, actorId: input.actorId, write: input.write })
        return { pendente: true, id }
    }
}
