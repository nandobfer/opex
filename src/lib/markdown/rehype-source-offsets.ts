/**
 * Plugin rehype da cópia em Markdown (OPE-220): grava em cada elemento com posição os offsets dele no
 * texto-fonte (`data-md-start`/`data-md-end`), os do conteúdo sem os marcadores (`data-md-content-start`/
 * `data-md-content-end`: sem `## `, `- `, `**`, `[`, `](url)`) e a tag original (`data-md-tag`; o `h1`
 * vira `h3` na tela). O `pre` tem o conteúdo pelas linhas, entre as cercas; o `code` dentro dele não é
 * anotado (o bloco é uma unidade só). Roda antes do `rehypeLogicalLines`, cujos spans não têm posição.
 */

interface Point {
    offset?: number
}
interface Position {
    start: Point
    end: Point
}
interface HastNode {
    type: string
    tagName?: string
    properties?: Record<string, unknown>
    children?: HastNode[]
    position?: Position
}

export const START_PROP = "dataMdStart"
export const END_PROP = "dataMdEnd"
export const CONTENT_START_PROP = "dataMdContentStart"
export const CONTENT_END_PROP = "dataMdContentEnd"
export const TAG_PROP = "dataMdTag"

const FENCE_LINE = /^\s{0,3}(`{3,}|~{3,})/
const CLOSING_FENCE = /^\s{0,3}(`{3,}|~{3,})\s*$/

const range = (node: HastNode): { start: number; end: number } | null => {
    const start = node.position?.start.offset
    const end = node.position?.end.offset
    return typeof start === "number" && typeof end === "number" ? { start, end } : null
}

/** Conteúdo do `pre`: da linha depois da cerca de abertura até antes da cerca de fechamento. */
export function codeContentRange(source: string, start: number, end: number): { start: number; end: number } {
    const block = source.slice(start, end)
    const firstBreak = block.indexOf("\n")
    const firstLine = firstBreak === -1 ? block : block.slice(0, firstBreak)
    if (!FENCE_LINE.test(firstLine)) return { start, end }
    if (firstBreak === -1) return { start: end, end }
    const contentStart = start + firstBreak + 1
    const lastBreak = block.lastIndexOf("\n")
    const lastLine = block.slice(lastBreak + 1)
    const contentEnd = lastBreak + 1 > firstBreak + 1 && CLOSING_FENCE.test(lastLine) ? start + lastBreak : end
    return { start: contentStart, end: Math.max(contentStart, contentEnd) }
}

function contentRange(node: HastNode, own: { start: number; end: number }): { start: number; end: number } {
    const positioned = (node.children ?? []).map(range).filter((value): value is { start: number; end: number } => value !== null)
    const first = positioned[0]
    const last = positioned[positioned.length - 1]
    if (!first || !last) return own
    return { start: Math.max(own.start, first.start), end: Math.min(own.end, last.end) }
}

function annotate(node: HastNode, source: string, parentTag: string | null) {
    if (node.type === "element" && node.tagName && !(node.tagName === "code" && parentTag === "pre")) {
        const own = range(node)
        if (own) {
            const content = node.tagName === "pre" ? codeContentRange(source, own.start, own.end) : contentRange(node, own)
            node.properties = {
                ...node.properties,
                [START_PROP]: own.start,
                [END_PROP]: own.end,
                [CONTENT_START_PROP]: content.start,
                [CONTENT_END_PROP]: content.end,
                [TAG_PROP]: node.tagName,
            }
        }
    }
    node.children?.forEach((child) => annotate(child, source, node.type === "element" ? (node.tagName ?? null) : parentTag))
}

export function rehypeSourceOffsets() {
    return (tree: HastNode, file: { value?: unknown }) => {
        annotate(tree, typeof file.value === "string" ? file.value : String(file.value ?? ""), null)
    }
}
