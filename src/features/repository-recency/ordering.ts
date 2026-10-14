/**
 * Regras puras do histórico de repositórios usados recentemente.
 *
 * O servidor devolve os ids do **mais recente** para o mais antigo. A ordenação é **estável**: os
 * repositórios já usados vêm primeiro (nessa ordem) e os demais mantêm a ordem original (ex.: a
 * alfabética dos filtros). Isso também é o que dá à busca do `SearchPicker` a regra "relevância
 * primeiro, uso recente como desempate": as opções entram no fuse.js já ordenadas, então empates de
 * relevância caem na ordem de recência.
 */

/** Reordena as opções colocando as mais recentes primeiro, sem mutar a lista recebida. */
export function orderByRecency<T>(items: readonly T[], recents: readonly string[], getKey: (item: T) => string): T[] {
    if (recents.length === 0) return [...items]
    const rank = new Map<string, number>()
    for (const [index, id] of recents.entries()) if (!rank.has(id)) rank.set(id, index)
    return items
        .map((item, index) => ({ item, index, rank: rank.get(getKey(item)) ?? Number.POSITIVE_INFINITY }))
        .sort((a, b) => (a.rank === b.rank ? a.index - b.index : a.rank - b.rank))
        .map((entry) => entry.item)
}

/**
 * Valores que **entraram** na seleção (de `previous` para `next`). O histórico registra apenas as
 * inclusões: desmarcar, limpar os filtros ou restaurar um estado salvo não conta como uso recente.
 */
export function newlySelected(previous: readonly string[], next: readonly string[]): string[] {
    return next.filter((value) => !previous.includes(value))
}
