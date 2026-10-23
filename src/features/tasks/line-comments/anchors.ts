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
    /** Comentário de trecho cuja linha existe, mas o trecho não está mais nela (fica só na linha). */
    selectionMissing: boolean
}

/** Texto comparável com o trecho (que vem como aparece na tela): sem ênfase, código nem URL de link. */
export function plainText(raw: string): string {
    return normalizeLine(raw.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")).replace(/[*_~`]/g, "").replace(/\s+/g, " ").trim()
}

const needleOf = (text: string) => plainText(text.split("\n")[0] ?? "")

export function resolveLineAnchors<T>(markdown: string, items: T[], refOf: (item: T) => TaskLineRef): AnchoredRef<T>[] {
    const lines = sourceLines(markdown)
    const orphan = (item: T): AnchoredRef<T> => ({ item, line: null, relocated: false, selectionMissing: false })
    if (!lines.length) return items.map(orphan)
    const plain = lines.map((line) => plainText(line.raw))
    let fuse: Fuse<(typeof lines)[number]> | null = null
    const closest = (candidates: typeof lines, target: number) => candidates.reduce((best, current) => (Math.abs(current.line - target) < Math.abs(best.line - target) ? current : best))
    /** O trecho ainda está nas linhas cobertas (terminando na âncora)? */
    const contains = (anchor: number, ref: TaskLineRef) => {
        if (!ref.selection) return true
        const index = lines.findIndex((line) => line.line === anchor)
        const covered = plain.slice(Math.max(0, index - ref.selection.lines + 1), index + 1).join(" ")
        return covered.includes(needleOf(ref.selection.text))
    }
    const at = (item: T, ref: TaskLineRef, line: number, relocated: boolean): AnchoredRef<T> => ({ item, line, relocated, selectionMissing: !contains(line, ref) })
    return items.map((item) => {
        const ref = refOf(item)
        const exact = lines.filter((line) => line.hash === ref.hash)
        if (exact.length) return at(item, ref, closest(exact, ref.line).line, false)
        if (ref.selection) {
            const needle = needleOf(ref.selection.text)
            const holding = needle ? lines.filter((_, index) => plain[index]!.includes(needle)) : []
            // O trecho é o começo da seleção: a âncora fica `lines - 1` linhas depois.
            if (holding.length) {
                const start = closest(holding, ref.line - ref.selection.lines + 1)
                const anchor = lines[Math.min(lines.length - 1, lines.indexOf(start) + ref.selection.lines - 1)]!
                return at(item, ref, anchor.line, true)
            }
        }
        const query = normalizeLine(ref.quote.replace(/…$/, ""))
        if (!query) return orphan(item)
        fuse ??= new Fuse(lines, { keys: ["normalized"], includeScore: true, ignoreLocation: true, threshold: RELOCATE_THRESHOLD })
        const results = fuse.search(query).filter((result) => (result.score ?? 1) <= RELOCATE_THRESHOLD)
        if (!results.length) return orphan(item)
        const bestScore = results[0]!.score ?? 0
        const tied = results.filter((result) => (result.score ?? 0) - bestScore < 0.05).map((result) => result.item)
        return at(item, ref, closest(tied, ref.line).line, true)
    })
}
