import { z } from "zod"
import { AI_AGENT_IDS, AI_AGENTS, isCentralScopedAgent, isClientScopedAgent, type AiAgentId, type MemoryListScope } from "@/features/ai/agents"
import { DomainError } from "@/lib/api/route"
import { MEMORY_TEXT_ABSOLUTE_MAX } from "@/features/ai/memory-text"
import { createAgentMemory, deleteAgentMemory, getAgentMemory, listAgentMemories, updateAgentMemory } from "@/features/ai/server/agent-memory-service"
import type { MemoryDto } from "@/features/ai/types"
import { defineTool } from "./define"
import { objectIdSchema } from "./helpers"

/**
 * Memórias dos agentes (gestão pelo dono): chamam o serviço real (`agent-memory-service`), que lê e
 * grava no Engramind. A lista é um enum do catálogo `src/features/ai/agents.ts` (Memórias do Opex,
 * Agente Opex, Agente Maddox, Agente Adversário e agente desenvolvedor), então listas futuras entram
 * sozinhas. `centralId` (de list_centrals) escolhe a central nas listas por central e `clientId` (de
 * list_clients) o cliente nas listas por cliente. Toda gravação é do dono (origem "Dono").
 */

const scopeHint = (id: AiAgentId) => (isCentralScopedAgent(id) ? " (exige centralId)" : isClientScopedAgent(id) ? " (exige clientId)" : "")
const AGENT_LIST = AI_AGENT_IDS.map((id) => `${id} = ${AI_AGENTS[id].title}${scopeHint(id)}`).join("; ")
const agent = z.enum(AI_AGENT_IDS).describe(`Lista de memórias: ${AGENT_LIST}`)
const memoryId = z.string().trim().regex(/^m_[A-Za-z0-9]+$/, "Use o id da memória (m_…) de list_agent_memories").describe("Id da memória (de list_agent_memories)")
const centralId = objectIdSchema.optional().describe("Id da central (de list_centrals); obrigatório na lista developer-central e recusado nas demais")
const clientId = objectIdSchema.optional().describe("Id do cliente (de list_clients); obrigatório nas listas *-client-specific e recusado nas demais")
const text = z.string().trim().min(1, "Escreva a memória").max(MEMORY_TEXT_ABSOLUTE_MAX).describe("Texto livre da memória (instrução ou fato permanente; os limites são os do Engramind)")
const categoria = z.string().trim().min(1).max(40).optional().describe("Categoria do Engramind (categories.list; padrão: a primeira)")
const fixada = z.boolean().optional().describe("Fixada (entra primeiro no contexto do agente)")
const ativa = z.boolean().optional().describe("Ativa; false inativa (arquiva, fora do contexto) e true reativa")

const view = (agentId: AiAgentId, memory: MemoryDto) => ({
    agent: agentId,
    agentLabel: AI_AGENTS[agentId].title,
    id: memory.id,
    ...(memory.centralId ? { centralId: memory.centralId } : {}),
    ...(memory.clientId ? { clientId: memory.clientId } : {}),
    summary: memory.resumo,
    text: memory.texto,
    category: memory.categoria,
    pinned: memory.fixada,
    active: memory.ativa,
    version: memory.versao,
    author: memory.autor,
    origin: memory.origin?.label ?? null,
    createdAt: memory.criadaEm,
    updatedAt: memory.atualizadaEm,
})
const short = (value: string) => (value.length > 80 ? `${value.slice(0, 79)}…` : value)
const where = (agentId: AiAgentId, scope: MemoryListScope) => `${AI_AGENTS[agentId].title}${scope.centralId ? ` · central ${scope.centralId}` : ""}${scope.clientId ? ` · cliente ${scope.clientId}` : ""}`

interface MemoryListView {
    agent: AiAgentId
    agentLabel: string
    centralId?: string
    centralName?: string
    clientId?: string
    clientName?: string
    items: ReturnType<typeof view>[]
}

/** Listas de um agente: nas por central/cliente, uma por central/cliente (o pedido ou todos). */
async function listsOf(agentId: AiAgentId, scope: MemoryListScope): Promise<MemoryListView[]> {
    const base = { agent: agentId, agentLabel: AI_AGENTS[agentId].title }
    if (isCentralScopedAgent(agentId)) {
        const { listCentrals } = await import("@/features/agentic/server/centrals")
        const centrals = (await listCentrals()).filter((item) => !scope.centralId || item.id === scope.centralId)
        if (scope.centralId && !centrals.length) throw new DomainError(404, "Central não encontrada", "CENTRAL_NOT_FOUND")
        return Promise.all(centrals.map(async (item) => ({ ...base, centralId: item.id, centralName: item.projectName, items: (await listAgentMemories(agentId, { centralId: item.id })).map((memory) => view(agentId, memory)) })))
    }
    if (isClientScopedAgent(agentId)) {
        const { OrcamentoClient } = await import("@/lib/db/models/Orcamento")
        const clients = await OrcamentoClient.find(scope.clientId ? { _id: scope.clientId } : {}).select({ _id: 1, name: 1 }).lean<{ _id: unknown; name?: string }[]>()
        if (scope.clientId && !clients.length) throw new DomainError(404, "Cliente não encontrado", "CLIENT_NOT_FOUND")
        return Promise.all(clients.map(async (item) => ({ ...base, clientId: String(item._id), clientName: item.name, items: (await listAgentMemories(agentId, { clientId: String(item._id) })).map((memory) => view(agentId, memory)) })))
    }
    return [{ ...base, items: (await listAgentMemories(agentId)).map((memory) => view(agentId, memory)) }]
}

const scopeOf = (input: { centralId?: string; clientId?: string }): MemoryListScope => ({ ...(input.centralId ? { centralId: input.centralId } : {}), ...(input.clientId ? { clientId: input.clientId } : {}) })

export const memoryTools = [
    defineTool({
        name: "list_agent_memories",
        group: "memories",
        label: "Listar memórias",
        risk: "read",
        description: `Memórias (instruções permanentes, no Engramind) dos agentes do Opex (${AGENT_LIST}), com id, resumo, texto, categoria, fixada, ativa, versão, autor e datas. Sem agent, lista as de todas as listas; as da central e as do cliente vêm agrupadas (centralId/clientId filtram uma).`,
        input: z.object({ agent: agent.optional(), centralId, clientId }),
        async execute(input) {
            const agents = input.agent ? [input.agent] : [...AI_AGENT_IDS]
            const lists = (await Promise.all(agents.map((id) => listsOf(id, { centralId: isCentralScopedAgent(id) ? input.centralId : undefined, clientId: isClientScopedAgent(id) ? input.clientId : undefined })))).flat()
            return { agents: lists, total: lists.reduce((sum, list) => sum + list.items.length, 0) }
        },
    }),
    defineTool({
        name: "get_agent_memory",
        group: "memories",
        label: "Ler memória",
        risk: "read",
        description: "Uma memória (texto completo, resumo, categoria, estado, versão, autor e datas). Informe o centralId/clientId nas listas por central/cliente.",
        input: z.object({ agent, memoryId, centralId, clientId }),
        async execute(input) {
            return view(input.agent, await getAgentMemory(input.agent, input.memoryId, scopeOf(input)))
        },
    }),
    defineTool({
        name: "create_agent_memory",
        group: "memories",
        label: "Criar memória",
        risk: "write",
        description: `Cria uma memória (instrução ou fato permanente) numa lista dos agentes do Opex (${AGENT_LIST}), com categoria e fixada opcionais. O resumo é gerado pelo Redator do Engramind. Vale a partir da próxima resposta (ou do próximo turno das mesas e forks). Texto igual a outra memória da lista não é gravado (duplicated=true).`,
        input: z.object({ agent, text, categoria, fixada, centralId, clientId }),
        summarize: (input) => `Criar a memória (${where(input.agent, input)}): "${short(input.text)}"`,
        async execute(input, { actorId }) {
            const result = await createAgentMemory(input.agent, input.text, actorId, { ...scopeOf(input), categoria: input.categoria, fixada: input.fixada })
            return { ok: true, ...view(input.agent, result.memoria), ...(result.duplicada ? { duplicated: true } : {}), ...(result.similares?.length ? { similar: result.similares } : {}) }
        },
    }),
    defineTool({
        name: "update_agent_memory",
        group: "memories",
        label: "Editar memória",
        risk: "write",
        description: "Altera uma memória: texto e/ou categoria (envie a versão lida para não sobrescrever uma edição concorrente), fixada (fixar/desafixar) e ativa (inativar/reativar). Informe o centralId/clientId nas listas por central/cliente.",
        input: z.object({ agent, memoryId, text: text.optional(), categoria, version: z.number().int().positive().optional().describe("Versão lida (de get_agent_memory)"), fixada, ativa, centralId, clientId }),
        summarize: (input) => `Editar a memória ${input.memoryId} (${where(input.agent, input)})${input.text ? `: "${short(input.text)}"` : ""}`,
        async execute(input, { actorId }) {
            if (input.text === undefined && input.categoria === undefined && input.fixada === undefined && input.ativa === undefined) throw new DomainError(400, "Informe o que mudar: text, categoria, fixada ou ativa", "VALIDATION_ERROR")
            const result = await updateAgentMemory(input.agent, input.memoryId, { texto: input.text, categoria: input.categoria, versao: input.version, fixada: input.fixada, ativa: input.ativa }, actorId, scopeOf(input))
            return { ok: true, ...view(input.agent, result.memoria) }
        },
    }),
    defineTool({
        name: "delete_agent_memory",
        group: "memories",
        label: "Excluir memória",
        risk: "destructive",
        description: "Exclui de vez uma memória no Engramind: o agente deixa de segui-la a partir da próxima resposta (ou do próximo turno da mesa/fork). Para só tirar do contexto, use update_agent_memory com ativa=false. Informe o centralId/clientId nas listas por central/cliente.",
        input: z.object({ agent, memoryId, centralId, clientId }),
        summarize: (input) => `Excluir a memória ${input.memoryId} (${where(input.agent, input)})`,
        async execute(input, { actorId }) {
            const removed = await deleteAgentMemory(input.agent, input.memoryId, actorId, scopeOf(input))
            return { ok: true, deleted: view(input.agent, removed) }
        },
    }),
]
