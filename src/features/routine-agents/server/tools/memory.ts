import { z } from "zod"
import { defineTool, type OpexTool } from "@/features/opex-agent/server/tools/define"
import { routineChannelOf, ROUTINE_GLOBAL_CHANNEL } from "../../constants"
import { listInChannel, memoryKeySchema, memoryTagsSchema, memoryTitleSchema, rememberInChannel, updateInChannel, type RoutineMemoryEnv } from "../memory-channels"

/**
 * Memória própria da execução (OPE-130, D13–D15): o agente rotineiro grava, edita e lista, com o
 * **próprio token**, em qualquer canal que assina (o próprio `agentes/rotineiros/<slug>`, o global dos
 * rotineiros e os extras do provisionamento). `chave` torna a gravação idempotente: uma entrada por item,
 * atualizada nas execuções seguintes. Sem limite de gravações por turno (OPE-163).
 */

export function routineMemoryTools(env: RoutineMemoryEnv): OpexTool[] {
    const own = routineChannelOf(env.slug)
    const channelOf = (input: { canal?: string; lista?: "agent" | "global" }) => input.canal ?? (input.lista === "global" ? ROUTINE_GLOBAL_CHANNEL : own)
    const canal = z.string().trim().min(1).optional().describe(`Canal da memória (um dos assinados: ${env.allowed.join(", ")}). Padrão: ${own}`)
    return [
        defineTool({
            name: "remember",
            group: "routine-agents",
            label: "Gravar memória",
            risk: "write",
            description:
                "Grava uma memória permanente (fato durável e autossuficiente) para as próximas execuções. Para manter UMA entrada por item (ex.: um repositório, uma vaga), informe `chave` fixa: com a mesma chave a entrada existente é atualizada (criada: false), nunca duplicada. `titulo` fixa o título. Sem `canal`, grava no canal do próprio agente.",
            input: z.object({
                texto: z.string().trim().min(3).max(20_000),
                canal,
                chave: memoryKeySchema.optional().describe("Chave fixa do item no canal (ex.: catalogo-dono-repo)"),
                titulo: memoryTitleSchema.optional(),
                tags: memoryTagsSchema.optional(),
                categoria: z.string().trim().max(60).optional(),
                lista: z.enum(["agent", "global"]).optional().describe("Compatibilidade: \"global\" = canal dos rotineiros; prefira `canal`"),
            }),
            execute: async (input) => {
                const result = await rememberInChannel(env, { ...input, canal: channelOf(input) })
                if (!input.chave && !result.duplicada && result.similares.some((item) => item.similaridade >= 0.9))
                    return { ...result, aviso: `Há memória quase igual (${result.similares[0]!.id}): para não duplicar, use update_memory com esse id ou grave com chave fixa.` }
                return result
            },
        }),
        defineTool({
            name: "update_memory",
            group: "routine-agents",
            label: "Atualizar memória",
            risk: "write",
            description: "Edita uma memória por id (texto, título, categoria ou tags) num canal assinado. `versao` (da listagem) evita sobrescrever uma mudança feita no meio do caminho.",
            input: z.object({
                id: z.string().trim().min(1),
                texto: z.string().trim().min(3).max(20_000).optional(),
                titulo: memoryTitleSchema.optional(),
                categoria: z.string().trim().max(60).optional(),
                tags: memoryTagsSchema.optional(),
                versao: z.number().int().positive().optional(),
            }),
            execute: async (input) => {
                return updateInChannel(env, input)
            },
        }),
        defineTool({
            name: "list_my_memories",
            group: "routine-agents",
            label: "Listar memórias",
            risk: "read",
            description:
                "Lista as memórias de um canal assinado com o texto inteiro (formato \"completo\") ou só id, chave e título (\"titulos\", para consultar um catálogo inteiro). Filtra por `chave`. Com `parcial: true` há mais páginas: chame de novo com `cursor`.",
            input: z.object({
                canal,
                lista: z.enum(["agent", "global"]).optional().describe("Compatibilidade: \"global\" = canal dos rotineiros; prefira `canal`"),
                chave: memoryKeySchema.optional(),
                formato: z.enum(["completo", "titulos"]).default("completo"),
                cursor: z.string().trim().min(1).optional(),
                limite: z.number().int().min(1).max(200).optional(),
            }),
            execute: async (input) => {
                const max = input.formato === "titulos" ? 200 : 50
                return listInChannel(env, { canal: channelOf(input), chave: input.chave, formato: input.formato, cursor: input.cursor, limite: Math.min(input.limite ?? max, max) })
            },
        }),
    ]
}
