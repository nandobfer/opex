/**
 * Leitura do contexto do Engramind no formato `tagged` (OPE-109, módulo PURO). O bloco tem uma linha
 * por memória (`#<id>: <texto achatado>`) dentro de `<channel slug="…">` / `<CATEGORIA>` (faixa 1,
 * texto completo) ou de `<titles>` (faixa 2, só título). Só a faixa 1 conta como injeção no
 * Engramind (`injected_count`); os títulos ficam à parte.
 *
 * Desde a 0.11.0 (decisão 0030) a faixa 2 traz a categoria e o canal: `#<id> [CATEGORIA] @canal: título`.
 * O formato antigo (`#<id>: título`) continua aceito (cache de antes do upgrade).
 */

export interface TaggedContextIds {
    /** Faixa 1: memórias entregues com o texto completo, com o canal de origem. */
    full: { id: string; channel: string }[]
    /** Faixa 2: memórias entregues só pelo título. */
    titles: string[]
    /** Faixa 2 com categoria e canal (vazios no formato antigo). */
    titleItems: { id: string; category: string | null; channel: string | null }[]
}

const CHANNEL_OPEN = /^<channel slug="([^"]+)">$/
const ITEM = /^#([^:\s]+): /
const TITLE_ITEM = /^#([^:\s\[]+) \[([^\]]+)\] @([^:\s]+): /

export function parseTaggedContext(content: string | null | undefined): TaggedContextIds {
    const result: TaggedContextIds = { full: [], titles: [], titleItems: [] }
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
        if (inTitles) {
            const titled = TITLE_ITEM.exec(line)
            const legacy = titled ? null : ITEM.exec(line)
            const id = titled?.[1] ?? legacy?.[1]
            if (!id) continue
            result.titles.push(id)
            result.titleItems.push({ id, category: titled?.[2] ?? null, channel: titled?.[3] ?? null })
            continue
        }
        const item = ITEM.exec(line)
        if (item && channel) result.full.push({ id: item[1], channel })
    }
    return result
}

/** Canais (sem repetir, na ordem do bloco) que entregaram ao menos uma memória com texto completo. */
export function deliveredChannels(ids: TaggedContextIds): string[] {
    return [...new Set(ids.full.map((item) => item.channel))]
}
