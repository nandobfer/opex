import type { MemoryDto } from "./types"

/**
 * Lista de memórias (módulo PURO, servidor): ordem de exibição. Ativas primeiro (as fixadas no topo), depois as inativas; cada grupo da mais recente para a
 * mais antiga.
 */

const timeOf = (iso: string) => new Date(iso).getTime() || 0

export function sortMemories(list: readonly MemoryDto[]): MemoryDto[] {
    const rank = (item: MemoryDto) => (!item.ativa ? 2 : item.fixada ? 0 : 1)
    return [...list].sort((a, b) => rank(a) - rank(b) || timeOf(b.criadaEm) - timeOf(a.criadaEm))
}
