/** Rótulo da espera pelo trabalho em segundo plano de um turno do OpenCode (OPE-216). Módulo puro. */

export interface BackgroundCounts {
    subagents: number
    shells: number
    other: number
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/** "Aguardando 2 subagentes e 1 comando em segundo plano…"; `null` quando não há nada a aguardar. */
export function backgroundLabel(counts: BackgroundCounts | null | undefined): string | null {
    if (!counts) return null
    const parts = [
        counts.subagents > 0 ? plural(counts.subagents, "subagente", "subagentes") : null,
        counts.shells > 0 ? plural(counts.shells, "comando", "comandos") : null,
        counts.other > 0 ? plural(counts.other, "tarefa", "tarefas") : null,
    ].filter((part): part is string => part !== null)
    if (!parts.length) return null
    const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} e ${parts.at(-1)}`
    return `Aguardando ${list} em segundo plano…`
}

/** Contagens com algo a aguardar (zeradas = a espera acabou). */
export const activeBackground = (counts: BackgroundCounts): BackgroundCounts | null => (counts.subagents + counts.shells + counts.other > 0 ? { subagents: counts.subagents, shells: counts.shells, other: counts.other } : null)
