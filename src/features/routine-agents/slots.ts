/**
 * Vagas e fila das execuções (OPE-130, módulo PURO). Só **Executando** e **Esperando** ocupam vaga;
 * a fila anda em ordem de chegada (FIFO por `queuedAt`).
 */

/** Quantas execuções da fila podem começar agora (`limit` `null` = sem limite). */
export function freeSlots(limit: number | null, occupied: number, queued: number): number {
    if (limit === null) return queued
    return Math.max(0, Math.min(queued, limit - occupied))
}

/** Ordem da fila: chegada mais antiga primeiro; empate pelo id (estável). */
export function fifoOrder<T extends { id: string; queuedAt: Date | string }>(rows: readonly T[]): T[] {
    return [...rows].sort((a, b) => new Date(a.queuedAt).getTime() - new Date(b.queuedAt).getTime() || a.id.localeCompare(b.id))
}
