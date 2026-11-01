import { z } from "zod"
import { DomainError } from "@/lib/api/route"
import { defineTool, type OpexTool } from "@/features/opex-agent/server/tools/define"
import { AI_AGENTS, contextChannelsFor, contextListsFor, writableListsFor, type AiAgentId, type MemoryConsumer, type MemoryListScope, type MemoryTurn } from "../../agents"
import { firstSentence } from "../../memory-text"
import { SELF_MEMORY_TURN_LIMIT } from "../../self-memory"
import type { MemoryDto, MemoryMutationResult } from "../../types"
import { createAgentMemory, deleteAgentMemory, listAgentMemories, updateAgentMemory } from "../agent-memory-service"

/**
 * Ferramentas "Memória própria" (aprendizado autônomo, OPE-104): o agente grava, edita, fixa,
 * inativa e exclui as memórias dos PRÓPRIOS canais, com o token dele no Engramind. As listas aceitas
 * vêm do turno (`writableListsFor`): no portal, só a do cliente da sessão, com o cliente forçado pelo
 * servidor. A central e o cliente nunca vêm do modelo quando o turno já define. As mesmas definições
 * servem o Agente Opex (nativo) e o MCP de memórias (Maddox, agente desenvolvedor e Agente Adversário).
 */

export interface SelfMemoryContext {
    consumer: MemoryConsumer
    turn: MemoryTurn
    /** Rótulo da origem ("Agente desenvolvedor · OPE-12"). */
    label: string
    /** Chave do turno (limite de gravações por turno). */
    turnKey: string
    actorId: string
    auditContext?: Record<string, unknown>
    /** Aviso discreto no turno a cada gravação. */
    onChange?: (message: string) => void
}

const counters = new Map<string, { count: number; at: number }>()
const COUNTER_TTL_MS = 6 * 3600_000

function takeSlot(turnKey: string): void {
    const now = Date.now()
    for (const [key, value] of counters) if (now - value.at > COUNTER_TTL_MS) counters.delete(key)
    const current = counters.get(turnKey) ?? { count: 0, at: now }
    if (current.count >= SELF_MEMORY_TURN_LIMIT) throw new DomainError(429, `Limite de ${SELF_MEMORY_TURN_LIMIT} gravações de memória neste turno atingido; consolide no próximo.`, "SELF_MEMORY_TURN_LIMIT")
    counters.set(turnKey, { count: current.count + 1, at: now })
}

/** Testes: zera os contadores por turno. */
export function resetSelfMemoryCounters(): void {
    counters.clear()
}

const memoryId = z.string().trim().regex(/^m_[A-Za-z0-9]+$/, "Use o id da memória (m_…) de list_my_memories").describe("Id da memória (de list_my_memories)")
const clientIdField = z.string().trim().regex(/^[a-f0-9]{24}$/, "clientId inválido").optional().describe("Cliente da lista de um cliente específico (só nos turnos do dono)")

/** Escopo da lista no turno: central da mesa, cliente da sessão (portal) ou o informado pelo dono. */
export function listScopeFor(context: Pick<SelfMemoryContext, "turn">, agentId: AiAgentId, clientId?: string): MemoryListScope {
    const def = AI_AGENTS[agentId]
    if (def.scope === "central") {
        if (context.turn.kind !== "central" || !context.turn.centralId) throw new DomainError(400, "Este turno não tem central", "CENTRAL_REQUIRED")
        return { centralId: context.turn.centralId }
    }
    if (def.scope === "client") {
        if (context.turn.kind === "client") return { clientId: context.turn.clientId }
        if (!clientId) throw new DomainError(400, `Informe o clientId da lista "${def.title}"`, "CLIENT_REQUIRED")
        return { clientId }
    }
    return {}
}

/** Confere se o agente grava nesta lista no turno (senão, recusa listando as válidas). */
export function assertWritable(context: Pick<SelfMemoryContext, "consumer" | "turn">, agentId: string): AiAgentId {
    const allowed = writableListsFor(context.consumer, context.turn)
    if (!(allowed as string[]).includes(agentId)) throw new DomainError(403, `Você não grava na lista "${agentId}" neste turno. Listas aceitas: ${allowed.join(", ")}`, "SELF_MEMORY_LIST_NOT_ALLOWED")
    return agentId as AiAgentId
}

const view = (agentId: AiAgentId, memory: MemoryDto) => ({
    lista: agentId,
    id: memory.id,
    resumo: memory.resumo,
    texto: memory.texto,
    categoria: memory.categoria,
    fixada: memory.fixada,
    ativa: memory.ativa,
    doDono: memory.doDono,
    autor: memory.autor,
    versao: memory.versao,
    ...(memory.clientId ? { clientId: memory.clientId } : {}),
    ...(memory.centralId ? { centralId: memory.centralId } : {}),
})

const resultView = (agentId: AiAgentId, result: MemoryMutationResult) => ({
    ok: true,
    ...view(agentId, result.memoria),
    ...(result.duplicada ? { duplicada: true, aviso: "Já existia uma memória igual nesta lista: nada foi gravado." } : {}),
    ...(result.similares?.length ? { similares: result.similares, dica: "Há memórias parecidas: prefira update_my_memory e funda o conteúdo." } : {}),
})

async function outsideContext(context: Pick<SelfMemoryContext, "consumer" | "turn">): Promise<number> {
    try {
        const { contextCacheKey } = await import("@/features/engramind/server/memory-context")
        const { EngramindContextCache } = await import("@/features/engramind/server/models")
        const row = await EngramindContextCache.findById(contextCacheKey(context.consumer, contextChannelsFor(context.consumer, context.turn))).select({ counts: 1 }).lean()
        return (row?.counts?.titles ?? 0) + (row?.counts?.overflow ?? 0)
    } catch {
        return 0
    }
}

/** Ferramentas do turno (as mesmas para o Agente Opex nativo e para o MCP de memórias). */
export function selfMemoryTools(context: SelfMemoryContext, listingLists?: AiAgentId[]): OpexTool[] {
    const readable = contextListsFor(context.consumer, context.turn)
    const writable = listingLists ?? writableListsFor(context.consumer, context.turn)
    const writableEnum = z.enum(writable as [AiAgentId, ...AiAgentId[]]).describe(`Lista: ${writable.map((id) => `${id} = ${AI_AGENTS[id].title}`).join("; ")}`)
    const needsClient = Boolean(listingLists) || (context.turn.kind !== "client" && writable.some((id) => AI_AGENTS[id].scope === "client"))
    const notify = (verb: string, memory: MemoryDto) => context.onChange?.(`Memória ${verb} pelo agente: ${firstSentence(memory.texto, 90)}`)
    const agent = { consumer: context.consumer, label: context.label }
    const write = { agent, auditContext: context.auditContext }

    const tools = [
        defineTool({
            name: "list_my_memories",
            group: "memories",
            label: "Minhas memórias",
            risk: "read",
            description: "Memórias que você segue neste turno (ativas e inativas), por lista, com id, resumo, texto, categoria, fixada, ativa, doDono e versão; e quantas ficaram fora do contexto (consolide quando houver).",
            input: z.object({ lista: z.string().optional().describe("Filtra uma lista") }),
            async execute(input) {
                const lists = readable.filter((item) => !input.lista || item.agentId === input.lista)
                const result = await Promise.all(lists.map(async (item) => ({ lista: item.agentId, titulo: AI_AGENTS[item.agentId].title, gravavel: writable.includes(item.agentId), memorias: (await listAgentMemories(item.agentId, item.scope ?? null)).map((memory) => view(item.agentId, memory)) })))
                return { listas: result, foraDoContexto: await outsideContext(context) }
            },
        }),
        defineTool({
            name: "remember",
            group: "memories",
            label: "Gravar memória",
            risk: "write",
            description: "Grava uma memória durável numa das suas listas (a mais específica que couber).",
            input: z.object({
                lista: writableEnum,
                texto: z.string().trim().min(1).describe("Um fato ou regra durável, autossuficiente"),
                categoria: z.string().trim().optional().describe("Categoria do Engramind (padrão: a primeira)"),
                fixada: z.boolean().optional().describe("Fixar (entra primeiro no contexto)"),
                ...(needsClient ? { clientId: clientIdField } : {}),
            }),
            async execute(input: { lista: AiAgentId; texto: string; categoria?: string; fixada?: boolean; clientId?: string }) {
                const list = assertWritable(context, input.lista)
                takeSlot(context.turnKey)
                const result = await createAgentMemory(list, input.texto, context.actorId, { ...listScopeFor(context, list, input.clientId), categoria: input.categoria, fixada: input.fixada, ...write })
                if (!result.duplicada) notify("gravada", result.memoria)
                return resultView(list, result)
            },
        }),
        defineTool({
            name: "update_my_memory",
            group: "memories",
            label: "Editar memória",
            risk: "write",
            description: "Edita o texto e/ou a categoria de uma memória sua (inclusive as do dono). Envie a versão lida para não sobrescrever uma edição concorrente.",
            input: z.object({ lista: writableEnum, memoryId, texto: z.string().trim().min(1).optional(), categoria: z.string().trim().optional(), versao: z.number().int().positive().optional(), ...(needsClient ? { clientId: clientIdField } : {}) }),
            async execute(input: { lista: AiAgentId; memoryId: string; texto?: string; categoria?: string; versao?: number; clientId?: string }) {
                const list = assertWritable(context, input.lista)
                if (input.texto === undefined && input.categoria === undefined) throw new DomainError(400, "Informe o texto ou a categoria", "VALIDATION_ERROR")
                takeSlot(context.turnKey)
                const result = await updateAgentMemory(list, input.memoryId, { texto: input.texto, categoria: input.categoria, versao: input.versao }, context.actorId, { ...listScopeFor(context, list, input.clientId), ...write })
                notify("editada", result.memoria)
                return resultView(list, result)
            },
        }),
        defineTool({
            name: "pin_my_memory",
            group: "memories",
            label: "Fixar memória",
            risk: "write",
            description: "Fixa (entra primeiro no contexto) ou desafixa uma memória sua.",
            input: z.object({ lista: writableEnum, memoryId, fixada: z.boolean(), ...(needsClient ? { clientId: clientIdField } : {}) }),
            async execute(input: { lista: AiAgentId; memoryId: string; fixada: boolean; clientId?: string }) {
                const list = assertWritable(context, input.lista)
                takeSlot(context.turnKey)
                const result = await updateAgentMemory(list, input.memoryId, { fixada: input.fixada }, context.actorId, { ...listScopeFor(context, list, input.clientId), ...write })
                notify(input.fixada ? "fixada" : "desafixada", result.memoria)
                return resultView(list, result)
            },
        }),
        defineTool({
            name: "set_my_memory_active",
            group: "memories",
            label: "Ativar/inativar memória",
            risk: "write",
            description: "Inativa (sai do contexto, recuperável) ou reativa uma memória sua. As do dono você não inativa.",
            input: z.object({ lista: writableEnum, memoryId, ativa: z.boolean(), ...(needsClient ? { clientId: clientIdField } : {}) }),
            async execute(input: { lista: AiAgentId; memoryId: string; ativa: boolean; clientId?: string }) {
                const list = assertWritable(context, input.lista)
                takeSlot(context.turnKey)
                const result = await updateAgentMemory(list, input.memoryId, { ativa: input.ativa }, context.actorId, { ...listScopeFor(context, list, input.clientId), ...write })
                notify(input.ativa ? "reativada" : "inativada", result.memoria)
                return resultView(list, result)
            },
        }),
        // `write` (sem confirmação): o aprendizado é autônomo por decisão do dono; a memória do dono é recusada no serviço.
        defineTool({
            name: "forget_my_memory",
            group: "memories",
            label: "Excluir memória",
            risk: "write",
            description: "Exclui de vez uma memória sua que ficou errada ou superada (prefira inativar quando houver dúvida). As do dono você não exclui.",
            input: z.object({ lista: writableEnum, memoryId, ...(needsClient ? { clientId: clientIdField } : {}) }),
            async execute(input: { lista: AiAgentId; memoryId: string; clientId?: string }) {
                const list = assertWritable(context, input.lista)
                takeSlot(context.turnKey)
                const removed = await deleteAgentMemory(list, input.memoryId, context.actorId, listScopeFor(context, list, input.clientId), write)
                notify("excluída", removed)
                return { ok: true, excluida: view(list, removed) }
            },
        }),
    ]
    return tools as unknown as OpexTool[]
}
