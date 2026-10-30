import { z } from "zod"
import { AI_AGENT_IDS, AI_AGENTS, isCentralScopedAgent, type AiAgentId } from "@/features/ai/agents"
import { DomainError } from "@/lib/api/route"
import { MEMORY_TEXT_MAX } from "@/features/ai/schemas"
import { createAgentMemory, deleteAgentMemory, getAgentMemory, listAgentMemories, updateAgentMemory } from "@/features/ai/server/agent-memory-service"
import type { MemoryDto } from "@/features/ai/types"
import { defineTool } from "./define"
import { objectIdSchema } from "./helpers"

/**
 * Memórias dos agentes (copiadas do Ciliar): chamam o serviço real (`agent-memory-service`). A lista
 * é um enum do catálogo `src/features/ai/agents.ts` (globais, do dono e do cliente do Agente Opex, a
 * do Agente Adversário e as do agente desenvolvedor — globais e por central), então listas futuras
 * entram sozinhas. Nas listas por central (`developer-central`), `centralId` (de list_centrals)
 * escolhe a central.
 */

const AGENT_LIST = AI_AGENT_IDS.map((id) => `${id} = ${AI_AGENTS[id].title}${isCentralScopedAgent(id) ? " (exige centralId)" : ""}`).join("; ")
const agent = z.enum(AI_AGENT_IDS).describe(`Lista de memórias: ${AGENT_LIST}`)
const memoryId = objectIdSchema.describe("Id da memória (de list_agent_memories)")
const centralId = objectIdSchema.optional().describe("Id da central (de list_centrals); obrigatório na lista developer-central e recusado nas demais")
const text = z.string().trim().min(3, "Escreva a memória").max(MEMORY_TEXT_MAX, "Até 2.000 caracteres").describe("Texto livre da memória (instrução ou fato permanente)")

const view = (agentId: AiAgentId, memory: MemoryDto) => ({
    agent: agentId,
    agentLabel: AI_AGENTS[agentId].title,
    id: memory.id,
    ...(memory.centralId ? { centralId: memory.centralId } : {}),
    summary: memory.resumo,
    text: memory.texto,
    author: memory.autor,
    origin: memory.origin?.label ?? null,
    createdAt: memory.criadaEm,
    updatedAt: memory.atualizadaEm,
})
const short = (value: string) => (value.length > 80 ? `${value.slice(0, 79)}…` : value)
const where = (agentId: AiAgentId, central?: string) => `${AI_AGENTS[agentId].title}${central ? ` · central ${central}` : ""}`

interface MemoryListView {
    agent: AiAgentId
    agentLabel: string
    centralId?: string
    centralName?: string
    items: ReturnType<typeof view>[]
}

/** Listas de um agente: nas por central, uma por central (a pedida ou todas). */
async function listsOf(agentId: AiAgentId, central?: string): Promise<MemoryListView[]> {
    if (!isCentralScopedAgent(agentId)) return [{ agent: agentId, agentLabel: AI_AGENTS[agentId].title, items: (await listAgentMemories(agentId)).map((memory) => view(agentId, memory)) }]
    const { listCentrals } = await import("@/features/agentic/server/centrals")
    const centrals = (await listCentrals()).filter((item) => !central || item.id === central)
    if (central && !centrals.length) throw new DomainError(404, "Central não encontrada", "CENTRAL_NOT_FOUND")
    return Promise.all(
        centrals.map(async (item) => ({ agent: agentId, agentLabel: AI_AGENTS[agentId].title, centralId: item.id, centralName: item.projectName, items: (await listAgentMemories(agentId, item.id)).map((memory) => view(agentId, memory)) })),
    )
}

export const memoryTools = [
    defineTool({
        name: "list_agent_memories",
        group: "memories",
        label: "Listar memórias",
        risk: "read",
        description: `Memórias (instruções permanentes) do Agente Opex, do Agente Adversário e do agente desenvolvedor das centrais (${AGENT_LIST}), com id, resumo, texto, autor e datas. Sem agent, lista as de todas as listas; as da central vêm agrupadas por central (centralId filtra uma).`,
        input: z.object({ agent: agent.optional(), centralId }),
        async execute(input) {
            const agents = input.agent ? [input.agent] : [...AI_AGENT_IDS]
            const lists = (await Promise.all(agents.map((id) => listsOf(id, isCentralScopedAgent(id) ? input.centralId : undefined)))).flat()
            return { agents: lists, total: lists.reduce((sum, list) => sum + list.items.length, 0) }
        },
    }),
    defineTool({
        name: "get_agent_memory",
        group: "memories",
        label: "Ler memória",
        risk: "read",
        description: "Uma memória (texto completo, resumo, autor e datas). Na lista developer-central, informe o centralId.",
        input: z.object({ agent, memoryId, centralId }),
        async execute(input) {
            return view(input.agent, await getAgentMemory(input.agent, input.memoryId, input.centralId))
        },
    }),
    defineTool({
        name: "create_agent_memory",
        group: "memories",
        label: "Criar memória",
        risk: "write",
        description: `Cria uma memória (instrução ou fato permanente, de 3 a 2.000 caracteres) numa lista do Agente Opex, do Agente Adversário ou do agente desenvolvedor (${AGENT_LIST}). O texto é revisado e resumido pelo uso "Resumo de memórias" (formattedByAi=false quando ele está indisponível). Sem limite de quantidade. As do agente desenvolvedor valem a partir do próximo turno das mesas e forks.`,
        input: z.object({ agent, text, centralId }),
        summarize: (input) => `Criar a memória (${where(input.agent, input.centralId)}): "${short(input.text)}"`,
        async execute(input, { actorId }) {
            const result = await createAgentMemory(input.agent, input.text, actorId, { centralId: input.centralId })
            return { ok: true, ...view(input.agent, result.memoria), formattedByAi: result.formatadaPorIa }
        },
    }),
    defineTool({
        name: "update_agent_memory",
        group: "memories",
        label: "Editar memória",
        risk: "write",
        description: "Substitui o texto de uma memória (revisado e resumido de novo pelo Resumo de memórias). Na lista developer-central, informe o centralId.",
        input: z.object({ agent, memoryId, text, centralId }),
        summarize: (input) => `Editar a memória (${where(input.agent, input.centralId)}): "${short(input.text)}"`,
        async execute(input, { actorId }) {
            const result = await updateAgentMemory(input.agent, input.memoryId, input.text, actorId, { centralId: input.centralId })
            return { ok: true, ...view(input.agent, result.memoria), formattedByAi: result.formatadaPorIa }
        },
    }),
    defineTool({
        name: "delete_agent_memory",
        group: "memories",
        label: "Excluir memória",
        risk: "destructive",
        description: "Exclui uma memória: o agente deixa de segui-la a partir da próxima resposta (ou do próximo turno da mesa/fork). Na lista developer-central, informe o centralId.",
        input: z.object({ agent, memoryId, centralId }),
        summarize: (input) => `Excluir a memória ${input.memoryId} (${where(input.agent, input.centralId)})`,
        async execute(input, { actorId }) {
            const removed = await deleteAgentMemory(input.agent, input.memoryId, actorId, input.centralId)
            return { ok: true, deleted: view(input.agent, removed) }
        },
    }),
]
