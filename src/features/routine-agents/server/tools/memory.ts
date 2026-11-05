import { z } from "zod"
import { defineTool, OpexToolError, type OpexTool } from "@/features/opex-agent/server/tools/define"
import type { EngramindTarget } from "@/features/engramind/server/client"

/**
 * Memória própria da execução (OPE-130): o agente rotineiro grava e lista, com o **próprio token**,
 * no canal dele (`agentes/rotineiros/<slug>`) e no global dos rotineiros. Os canais extras são só de
 * leitura (entram no contexto). No máximo `MAX_WRITES` gravações por ativação.
 */

const MAX_WRITES = 5
const LISTS = { agent: "routine-specific", global: "routine-global" } as const

export function routineMemoryTools(env: { slug: string; label: string; target: EngramindTarget; runId: string }): OpexTool[] {
    let writes = 0
    const scope = (lista: keyof typeof LISTS) => (lista === "agent" ? { routineSlug: env.slug } : {})
    return [
        defineTool({
            name: "remember",
            group: "routine-agents",
            label: "Gravar memória",
            risk: "write",
            description:
                "Grava uma memória permanente (fato durável e autossuficiente) para as próximas execuções: o que você já fez (ex.: vagas já candidatadas), o que aprendeu e as correções do dono. lista \"agent\" = só este agente; \"global\" = todos os agentes rotineiros.",
            input: z.object({ lista: z.enum(["agent", "global"]), texto: z.string().trim().min(3).max(4_000), categoria: z.string().trim().max(60).optional() }),
            execute: async (input) => {
                if (writes >= MAX_WRITES) throw new OpexToolError(`Limite de ${MAX_WRITES} memórias por turno atingido: junte as próximas numa só`)
                writes++
                const { createAgentMemory } = await import("@/features/ai/server/agent-memory-service")
                const result = await createAgentMemory(LISTS[input.lista], input.texto, "local", {
                    ...scope(input.lista),
                    categoria: input.categoria ?? null,
                    agent: { consumer: "rotineiro", label: env.label, target: env.target },
                    auditContext: { execucao: env.runId },
                })
                return { id: result.memoria.id, duplicada: result.duplicada ?? false, similares: result.similares ?? [] }
            },
        }),
        defineTool({
            name: "list_my_memories",
            group: "routine-agents",
            label: "Listar memórias",
            risk: "read",
            description: "Lista as memórias deste agente (lista \"agent\") ou de todos os rotineiros (\"global\"), com id, resumo e texto.",
            input: z.object({ lista: z.enum(["agent", "global"]).default("agent") }),
            execute: async (input) => {
                const { listAgentMemories } = await import("@/features/ai/server/agent-memory-service")
                const rows = await listAgentMemories(LISTS[input.lista], scope(input.lista))
                return rows.filter((row) => row.ativa).slice(0, 100).map((row) => ({ id: row.id, resumo: row.resumo, texto: row.texto.slice(0, 1_000), categoria: row.categoria, doDono: row.doDono }))
            },
        }),
    ]
}
