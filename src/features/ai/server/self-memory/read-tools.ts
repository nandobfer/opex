import { z } from "zod"
import { DomainError } from "@/lib/api/route"
import { defineTool, type OpexTool } from "@/features/opex-agent/server/tools/define"
import { contextChannelsFor, type MemoryConsumer, type MemoryTurn } from "../../agents"
import { SELF_MEMORY_TOOL_METAS } from "../../self-memory"

/**
 * Ferramentas de LEITURA da memória própria (OPE-117): a faixa de títulos (`<titles>`) vira acionável.
 * - `get_hints`: `POST /v1/hints` (só id, título, canal e nota; nunca o texto);
 * - `get_memory`: `GET /v1/memories/{id}`, a memória escolhida inteira;
 * - `search_memories`: busca híbrida/textual de reserva (dicas vazias, sem embeddings), com trecho curto.
 *
 * Sempre com o token do próprio agente e restritas aos canais de contexto do turno (`contextChannelsFor`).
 * O agente `opex`/`maddox` assina `agentes/<agente>/*` e alcançaria canais de outros clientes: por isso o
 * canal da memória lida é conferido **no Opex**. Não entram no cache do turno nem publicam
 * `engramind-consumption`; falha ou timeout vira erro acionável e o turno segue.
 */

const READ_TIMEOUT_MS = 5_000
const SNIPPET_MAX = 240
const SEARCH_MAX = 10

export interface SelfMemoryReadContext {
    consumer: MemoryConsumer
    turn: MemoryTurn
}

const memoryId = z.string().trim().regex(/^m_[A-Za-z0-9]+$/, "Use o id da memória (m_…) da faixa <titles> ou de get_hints").describe("Id da memória (m_…)")

/** Canal alcançado pelo turno (slug exato ou dentro de um prefixo `x/*`). */
export function channelInTurn(channel: string, channels: readonly string[]): boolean {
    return channels.some((item) => (item.endsWith("/*") ? channel.startsWith(item.slice(0, -1)) : item === channel))
}

export const snippetOf = (text: string, max = SNIPPET_MAX) => {
    const flat = text.replace(/\s+/g, " ").trim()
    return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`
}

async function readTarget(consumer: MemoryConsumer) {
    const { agentTarget } = await import("@/features/engramind/server/memory-network")
    const target = await agentTarget(consumer).catch(() => null)
    if (!target) throw new DomainError(503, "Memórias indisponíveis neste turno (o agente não tem token no Engramind). Siga sem elas.", "SELF_MEMORY_UNAVAILABLE")
    return target
}

/** Erro do Engramind (fora do ar, timeout, versão antiga) como mensagem acionável, sem derrubar o turno. */
function unavailable(error: unknown, what: string): never {
    if (error instanceof DomainError && error.code?.startsWith("SELF_MEMORY_")) throw error
    throw new DomainError(503, `Não foi possível ${what} agora (Engramind indisponível ou sem suporte). Siga sem essa memória; não invente o conteúdo.`, "SELF_MEMORY_UNAVAILABLE")
}

export function selfMemoryReadTools(context: SelfMemoryReadContext): OpexTool[] {
    const channels = contextChannelsFor(context.consumer, context.turn)
    const tools = [
        defineTool({
            name: "get_hints",
            group: "memories",
            ...SELF_MEMORY_TOOL_METAS.get_hints,
            input: z.object({
                text: z.string().trim().min(1, "Informe a mensagem ou a cena atual").max(2000, "Até 2000 caracteres").describe("Mensagem do usuário ou a cena atual"),
                limit: z.number().int().min(1).max(20).optional().describe("Quantas dicas (1 a 20)"),
            }),
            async execute(input: { text: string; limit?: number }) {
                const target = await readTarget(context.consumer)
                const { engramindCall } = await import("@/features/engramind/server/client")
                let hints: { id: string; title: string; channel: string; score: number }[]
                try {
                    const result = await engramindCall<{ hints?: { id: string; title: string; channel: string; score: number }[] }>("POST", { path: "/v1/hints", body: { text: input.text, channels, limit: input.limit } }, { target, timeoutMs: READ_TIMEOUT_MS })
                    hints = result?.hints ?? []
                } catch (error) {
                    unavailable(error, "buscar as dicas")
                }
                const dicas = hints.filter((hint) => channelInTurn(hint.channel, channels)).map((hint) => ({ id: hint.id, titulo: hint.title, canal: hint.channel, nota: Math.round(hint.score * 100) / 100 }))
                return dicas.length ? { dicas } : { dicas, dica: "Nenhuma dica (sem embeddings ou nada acima do limiar): use search_memories com os termos do título." }
            },
        }),
        defineTool({
            name: "get_memory",
            group: "memories",
            ...SELF_MEMORY_TOOL_METAS.get_memory,
            input: z.object({ memoryId }),
            async execute(input: { memoryId: string }) {
                const target = await readTarget(context.consumer)
                const { engramindCall } = await import("@/features/engramind/server/client")
                const { engramindCodeOf } = await import("@/features/engramind/server/errors")
                let memory: { id: string; channel: string; text: string; title: string | null; category: string; status: string; version: number } | null
                try {
                    memory = await engramindCall("GET", { path: `/v1/memories/${encodeURIComponent(input.memoryId)}` }, { target, timeoutMs: READ_TIMEOUT_MS })
                } catch (error) {
                    if (engramindCodeOf(error) === "MEMORY_NOT_FOUND") throw new DomainError(404, "Memória não encontrada nos seus canais: não invente o conteúdo.", "SELF_MEMORY_NOT_FOUND")
                    unavailable(error, "ler a memória")
                }
                if (!memory || !channelInTurn(memory.channel, channels)) throw new DomainError(404, "Memória não encontrada nos seus canais: não invente o conteúdo.", "SELF_MEMORY_NOT_FOUND")
                return { id: memory.id, titulo: memory.title, texto: memory.text, categoria: memory.category, canal: memory.channel, status: memory.status, versao: memory.version }
            },
        }),
        defineTool({
            name: "search_memories",
            group: "memories",
            ...SELF_MEMORY_TOOL_METAS.search_memories,
            input: z.object({
                query: z.string().trim().min(1, "Digite o que procurar").max(500).describe("Termos do título ou do assunto"),
                limit: z.number().int().min(1).max(SEARCH_MAX).optional().describe(`Quantos resultados (até ${SEARCH_MAX})`),
            }),
            async execute(input: { query: string; limit?: number }) {
                const target = await readTarget(context.consumer)
                const { engramindCall } = await import("@/features/engramind/server/client")
                let rows: { memory: { id: string; channel: string; title?: string | null; text?: string; category?: string } }[]
                let mode = "text"
                try {
                    const result = await engramindCall<{ mode?: string; results?: typeof rows }>("POST", { path: "/v1/memories/search", body: { query: input.query, channels, limit: input.limit ?? 5, exclude_context: true } }, { target, timeoutMs: READ_TIMEOUT_MS })
                    rows = result?.results ?? []
                    mode = result?.mode ?? "text"
                } catch (error) {
                    unavailable(error, "buscar nas memórias")
                }
                const resultados = rows
                    .filter((row) => channelInTurn(row.memory.channel, channels))
                    .slice(0, SEARCH_MAX)
                    .map((row) => ({ id: row.memory.id, titulo: row.memory.title ?? null, canal: row.memory.channel, categoria: row.memory.category ?? null, trecho: snippetOf(row.memory.text ?? "") }))
                return { modo: mode, resultados, ...(resultados.length ? { dica: "Leia a escolhida com get_memory." } : {}) }
            },
        }),
    ]
    return tools as unknown as OpexTool[]
}
