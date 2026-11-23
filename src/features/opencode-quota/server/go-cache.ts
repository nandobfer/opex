/**
 * Memória da assinatura OpenCode Go (OPE-180), módulo PURO: toda gravação passa por `writeCache`, que descarta as
 * entradas vencidas antes de inserir e remove a mais antiga ao atingir o teto. Ler só com TTL não libera memória num
 * processo de longa duração (agendador interno).
 */

export interface CacheEntry<T> {
    at: number
    /** Instante a partir do qual a entrada não vale mais (e sai na próxima gravação). */
    expiresAt: number
    value: T
    /** Resultado negativo (a chamada falhou). */
    failed?: boolean
}

/** Entrada ainda válida em `nowMs`; a vencida sai do mapa. */
export function readCache<T>(map: Map<string, CacheEntry<T>>, key: string, nowMs: number): CacheEntry<T> | undefined {
    const hit = map.get(key)
    if (!hit) return undefined
    if (nowMs >= hit.expiresAt) {
        map.delete(key)
        return undefined
    }
    return hit
}

/** Grava podando as vencidas (em relação a `entry.at`) e mantendo no máximo `max` entradas (a mais antiga sai). */
export function writeCache<T>(map: Map<string, CacheEntry<T>>, key: string, entry: CacheEntry<T>, max: number): void {
    map.delete(key)
    for (const [candidate, cached] of map) {
        if (entry.at >= cached.expiresAt) map.delete(candidate)
    }
    while (map.size >= Math.max(1, max)) {
        const oldest = map.keys().next().value
        if (oldest === undefined) break
        map.delete(oldest)
    }
    map.set(key, entry)
}
