import { contextChannelsFor, type MemoryConsumer, type MemoryTurn } from "../agents"
import type { MemoriesMetaDto } from "../types"

/**
 * Contexto das memórias de cada agente no prompt (OPE-104): o bloco do Engramind com os canais do
 * turno (`contextChannelsFor`). Imports sob demanda: o Engramind e o banco só entram quando um turno
 * pede as memórias. Nunca lança (o serviço do Engramind cai no cache ou em "sem memórias").
 */

export type { MemoryContextResult } from "@/features/engramind/server/memory-context"

export async function agentMemoryContext(consumer: MemoryConsumer, turn: MemoryTurn) {
    const { getAgentMemoryContext } = await import("@/features/engramind/server/memory-context")
    return getAgentMemoryContext(consumer, contextChannelsFor(consumer, turn))
}

/** Agente Adversário: Memórias do Opex + a lista dele. */
export const adversarialMemoryContext = () => agentMemoryContext("adversario", { kind: "review" })

/** Agente desenvolvedor: Memórias do Opex, as globais e as da central (a arquivada fica de fora). */
export const developerMemoryContext = (centralId: string | null) => agentMemoryContext("desenvolvedor", { kind: "central", centralId })

/** Metadados das telas de memórias. Nunca lança: um erro do Engramind vem em `error`. */
export async function getMemoriesMeta(): Promise<MemoriesMetaDto> {
    const [{ memorySettings }, { memoryContextHealth, memoryContextOverflow }, { isMemoryMigrationPending }] = await Promise.all([
        import("./memory-settings"),
        import("@/features/engramind/server/memory-context"),
        import("@/features/engramind/server/migration"),
    ])
    const availability = await memoryContextHealth().catch(() => ({ unavailable: false, since: null, lastOkAt: null, reason: null }))
    const migrationPending = await isMemoryMigrationPending().catch(() => true)
    const outside = (await memoryContextOverflow().catch(() => [])).map((row) => ({ consumer: row.consumer, channels: row.channels, outside: row.outside + row.titles }))
    try {
        const settings = await memorySettings()
        return { textMin: settings.textMin, textMax: settings.textMax, categories: settings.categories.map((item) => ({ key: item.key, label: item.label })), migrationPending, availability, outside, error: null }
    } catch (error) {
        return { textMin: 3, textMax: 4000, categories: [], migrationPending, availability, outside, error: error instanceof Error ? error.message : String(error) }
    }
}
