import Fuse from "fuse.js"
import { normalizeLine, sourceLines } from "@/lib/markdown/lines"
import type { TaskLineRef } from "../types"

/**
 * Liga cada comentário de linha à linha atual do texto: hash exato (entre linhas repetidas, a mais
 * próxima da original); senão a linha mais parecida com a citação (fuse.js, marcada como
 * `relocated`); sem candidata boa, o comentário fica órfão.
 */

export const RELOCATE_THRESHOLD = 0.4

export interface AnchoredRef<T> {
    item: T
    /** Linha atual (null = órfão). */
    line: number | null
    relocated: boolean
}

export function resolveLineAnchors<T>(markdown: string, items: T[], refOf: (item: T) => TaskLineRef): AnchoredRef<T>[] {
    const lines = sourceLines(markdown)
    if (!lines.length) return items.map((item) => ({ item, line: null, relocated: false }))
    let fuse: Fuse<(typeof lines)[number]> | null = null
    const closest = (candidates: typeof lines, target: number) => candidates.reduce((best, current) => (Math.abs(current.line - target) < Math.abs(best.line - target) ? current : best))
    return items.map((item) => {
        const ref = refOf(item)
        const exact = lines.filter((line) => line.hash === ref.hash)
        if (exact.length) return { item, line: closest(exact, ref.line).line, relocated: false }
        const query = normalizeLine(ref.quote.replace(/…$/, ""))
        if (!query) return { item, line: null, relocated: false }
        fuse ??= new Fuse(lines, { keys: ["normalized"], includeScore: true, ignoreLocation: true, threshold: RELOCATE_THRESHOLD })
        const results = fuse.search(query).filter((result) => (result.score ?? 1) <= RELOCATE_THRESHOLD)
        if (!results.length) return { item, line: null, relocated: false }
        const bestScore = results[0]!.score ?? 0
        const tied = results.filter((result) => (result.score ?? 0) - bestScore < 0.05).map((result) => result.item)
        return { item, line: closest(tied, ref.line).line, relocated: true }
    })
}
