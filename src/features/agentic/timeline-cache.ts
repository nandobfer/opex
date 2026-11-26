import type { TimelineState } from "./timeline"

/**
 * Saídas já carregadas nesta aba (memória do navegador, sem persistir), por URL do stream. Voltar a uma
 * mesa mostra a saída guardada na hora; o stream relê tudo por trás e troca no `ready` (OPE-188).
 * LRU: a leitura renova a entrada; acima do limite sai a menos usada.
 */
export const TIMELINE_CACHE_LIMIT = 12

const cache = new Map<string, TimelineState>()

export function readTimelineCache(url: string): TimelineState | null {
    const state = cache.get(url)
    if (!state) return null
    cache.delete(url)
    cache.set(url, state)
    return state
}

export function writeTimelineCache(url: string, state: TimelineState): void {
    if (!state.loaded) return
    cache.delete(url)
    cache.set(url, state)
    while (cache.size > TIMELINE_CACHE_LIMIT) cache.delete(cache.keys().next().value as string)
}

/** Esquece as saídas cuja URL contém o trecho (ex.: o id de uma mesa ou fork excluído). */
export function dropTimelineCache(match: string): void {
    for (const url of [...cache.keys()]) if (url.includes(match)) cache.delete(url)
}

/** Só para testes. */
export function clearTimelineCache(): void {
    cache.clear()
}
