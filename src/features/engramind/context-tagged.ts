/**
 * Leitura do contexto do Engramind no formato `tagged` (OPE-109, módulo PURO). O bloco tem uma linha
 * por memória (`#<id>: <texto achatado>`) dentro de `<channel slug="…">` / `<CATEGORIA>` (faixa 1,
 * texto completo) ou de `<titles>` (faixa 2, só título). Só a faixa 1 conta como injeção no
 * Engramind (`injected_count`); os títulos ficam à parte.
 */

export interface TaggedContextIds {
    /** Faixa 1: memórias entregues com o texto completo, com o canal de origem. */
    full: { id: string; channel: string }[]
    /** Faixa 2: memórias entregues só pelo título. */
    titles: string[]
}

const CHANNEL_OPEN = /^<channel slug="([^"]+)">$/
const ITEM = /^#([^:\s]+): /

export function parseTaggedContext(content: string | null | undefined): TaggedContextIds {
    const result: TaggedContextIds = { full: [], titles: [] }
    if (!content) return result
    let channel: string | null = null
    let inTitles = false
    for (const raw of content.split("\n")) {
        const line = raw.trimEnd()
        const open = CHANNEL_OPEN.exec(line)
        if (open) {
            channel = open[1]
            continue
        }
        if (line === "</channel>") {
            channel = null
            continue
        }
        if (line === "<titles>") {
            inTitles = true
            continue
        }
        if (line === "</titles>") {
            inTitles = false
            continue
        }
        const item = ITEM.exec(line)
        if (!item) continue
        if (inTitles) result.titles.push(item[1])
        else if (channel) result.full.push({ id: item[1], channel })
    }
    return result
}

/** Canais (sem repetir, na ordem do bloco) que entregaram ao menos uma memória com texto completo. */
export function deliveredChannels(ids: TaggedContextIds): string[] {
    return [...new Set(ids.full.map((item) => item.channel))]
}
