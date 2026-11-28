/**
 * Cópia da seleção em Markdown (OPE-220): liga as pontas da seleção do navegador aos offsets do
 * texto-fonte gravados pelo `rehypeSourceOffsets` e monta o Markdown do trecho. Regras (decisões do
 * dono no plano): inline (negrito, link, código…) só leva a marcação quando está inteiro na seleção —
 * em parte, vai o texto puro; blocos ganham o marcador (`## `, `- `, `> `) quando o conteúdo deles é
 * coberto desde o começo até o fim ou além; seleção dentro de um só bloco de código copia o código
 * puro e, cortando o bloco, o lado cortado ganha a cerca; tabela cortada entre células vira linhas
 * inteiras, com o cabeçalho. Quando o alinhamento falha, devolve `null` e a cópia segue a nativa.
 * Só DOM, sem React.
 */

import { MD_CONTROL_SELECTOR, rangeText } from "./selection"

export { MD_CONTROL_SELECTOR }

export const MD_ROOT_ATTR = "data-md-root"
const ANNOTATED = "[data-md-start]"
const INLINE_TAGS = new Set(["strong", "em", "del", "a", "code"])
const CELL_TAGS = new Set(["td", "th"])
const CLOSING_FENCE = /^\s{0,3}(`{3,}|~{3,})\s*$/
const OPENING_FENCE = /^\s{0,3}(`{3,}|~{3,})/
const EDITABLE = "input, textarea, [contenteditable]:not([contenteditable='false']), .cm-editor"

const sources = new WeakMap<Element, string>()

/** Liga a raiz de um `Markdown` ao texto-fonte dele (chamado pelo componente a cada renderização). */
export function registerMarkdownSource(root: Element, source: string): void {
    sources.set(root, source)
}

export function markdownSourceOf(root: Element): string | undefined {
    return sources.get(root)
}

interface Annot {
    node: Element
    tag: string
    start: number
    end: number
    contentStart: number
    contentEnd: number
}

interface Point {
    node: Node
    offset: number
}

function annotOf(element: Element): Annot {
    const num = (name: string) => Number(element.getAttribute(name))
    return {
        node: element,
        tag: element.getAttribute("data-md-tag") ?? element.tagName.toLowerCase(),
        start: num("data-md-start"),
        end: num("data-md-end"),
        contentStart: num("data-md-content-start"),
        contentEnd: num("data-md-content-end"),
    }
}

const rootAnnot = (root: Element, source: string): Annot => ({ node: root, tag: "root", start: 0, end: source.length, contentStart: 0, contentEnd: source.length })

const isSpace = (char: string | undefined) => char !== undefined && /\s/.test(char)

const CHARACTER_REFERENCE = /^&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([A-Za-z][A-Za-z0-9]{1,31}));/

/**
 * Tamanho da referência de caractere (`&copy;`, `&#169;`, `&#xA9;`) que começa em `at` e virou `char`
 * na tela; 0 quando não há. Numéricas são conferidas; nomeadas valem pelo caractere renderizado (o
 * micromark só decodifica nomes válidos; um nome inválido fica literal e casa caractere a caractere).
 */
function referenceLength(source: string, at: number, char: string): number {
    if (source[at] !== "&") return 0
    const match = CHARACTER_REFERENCE.exec(source.slice(at, at + 40))
    if (!match) return 0
    const code = match[1] ? Number(match[1]) : match[2] ? parseInt(match[2], 16) : null
    if (code !== null) {
        const decoded = code === 0 || code > 0x10ffff ? "\ufffd" : String.fromCodePoint(code)
        return decoded === char ? match[0].length : 0
    }
    if (char === "&") return /^&amp;$/i.test(match[0]) ? match[0].length : 0
    return match[0].length
}

/**
 * Avança `from` no fonte acompanhando o texto renderizado: caractere igual anda nos dois, espaço casa
 * com espaço (ou é pulado quando o fonte não tem) e o resto do fonte (marcação, `\`, `> `, indentação)
 * é pulado. `null` quando um caractere renderizado não aparece até `limit`.
 */
export function alignRenderedOffset(source: string, rendered: string, from: number, limit: number = source.length): number | null {
    let cursor = from
    for (const char of rendered) {
        if (isSpace(char)) {
            if (cursor < limit && isSpace(source[cursor])) cursor++
            continue
        }
        let reference = 0
        while (cursor < limit && source[cursor] !== char && !(reference = referenceLength(source, cursor, char))) cursor++
        // `&amp;` renderizado como `&`: a referência inteira, não só o `&` literal.
        if (cursor < limit && source[cursor] === "&" && char === "&") reference = referenceLength(source, cursor, char)
        if (cursor >= limit) return null
        cursor += reference && cursor + reference <= limit ? reference : 1
    }
    return cursor
}

function comparePoints(a: Point, b: Point): number {
    const doc = a.node.ownerDocument ?? document
    const first = doc.createRange()
    first.setStart(a.node, a.offset)
    const second = doc.createRange()
    second.setStart(b.node, b.offset)
    return first.compareBoundaryPoints(Range.START_TO_START, second)
}

const indexIn = (node: Node) => Array.prototype.indexOf.call(node.parentNode?.childNodes ?? [], node) as number
const before = (node: Node): Point => ({ node: node.parentNode!, offset: indexIn(node) })
const after = (node: Node): Point => ({ node: node.parentNode!, offset: indexIn(node) + 1 })

/** Filhos que contam no alinhamento: textos e elementos anotados; desce pelos demais, pula os controles. */
function units(node: Node): (Text | Element)[] {
    const list: (Text | Element)[] = []
    node.childNodes.forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) list.push(child as Text)
        else if (child instanceof Element) {
            if (child.matches(MD_CONTROL_SELECTOR)) return
            if (child.hasAttribute("data-md-start")) list.push(child)
            else list.push(...units(child))
        }
    })
    return list
}

/** Offset no fonte de um ponto dentro de `annot` (o anotado mais interno que o contém). */
function offsetIn(annot: Annot, point: Point, source: string): number | null {
    let cursor = annot.contentStart
    for (const unit of units(annot.node)) {
        if (unit.nodeType === Node.TEXT_NODE) {
            const text = unit as Text
            if (point.node === text) return alignRenderedOffset(source, text.data.slice(0, point.offset), cursor, annot.contentEnd)
            if (comparePoints(point, { node: text, offset: 0 }) <= 0) return cursor
            const next = alignRenderedOffset(source, text.data, cursor, annot.contentEnd)
            if (next === null) return null
            cursor = next
            continue
        }
        const element = unit as Element
        if (element.contains(point.node)) return offsetIn(annotOf(element), point, source)
        if (comparePoints(point, before(element)) <= 0) return cursor
        cursor = Math.max(cursor, Number(element.getAttribute("data-md-end")))
    }
    return annot.contentEnd
}

/** Anotados que contêm o ponto, do mais interno para fora (sem a raiz). */
function ancestorsOf(root: Element, point: Point): Annot[] {
    const list: Annot[] = []
    let element: Element | null = point.node instanceof Element ? point.node : point.node.parentElement
    while (element && element !== root && root.contains(element)) {
        if (element.matches(ANNOTATED)) list.push(annotOf(element))
        element = element.parentElement
    }
    return list
}

/** Tira o ponto de dentro de um controle e trata mídia como atômica (entra inteira). */
function normalize(root: Element, point: Point, side: "start" | "end"): Point {
    const element = point.node instanceof Element ? point.node : point.node.parentElement
    const control = element?.closest(MD_CONTROL_SELECTOR)
    let result = point
    if (control && root.contains(control) && control !== root) result = side === "start" ? after(control) : before(control)
    const owner = result.node instanceof Element ? result.node : result.node.parentElement
    const media = owner?.closest("[data-md-tag='img']")
    if (media && root.contains(media)) result = side === "start" ? before(media) : after(media)
    return result
}

function textBetween(from: Point, to: Point): string {
    const range = (from.node.ownerDocument ?? document).createRange()
    range.setStart(from.node, from.offset)
    range.setEnd(to.node, to.offset)
    return rangeText(range)
}

const hasTextBefore = (annot: Annot, point: Point) => textBetween({ node: annot.node, offset: 0 }, point).trim() !== ""
const hasTextAfter = (annot: Annot, point: Point) => textBetween(point, { node: annot.node, offset: annot.node.childNodes.length }).trim() !== ""

/** Texto renderizado da parte do intervalo dentro de `element`. */
function textInside(range: Range, element: Node): string {
    const part = (element.ownerDocument ?? document).createRange()
    part.selectNodeContents(element)
    if (range.compareBoundaryPoints(Range.START_TO_START, part) > 0) part.setStart(range.startContainer, range.startOffset)
    if (range.compareBoundaryPoints(Range.END_TO_END, part) < 0) part.setEnd(range.endContainer, range.endOffset)
    return rangeText(part)
}

const lineStartOf = (source: string, offset: number) => source.lastIndexOf("\n", offset - 1) + 1
const lineEndOf = (source: string, offset: number) => {
    const index = source.indexOf("\n", offset)
    return index === -1 ? source.length : index
}

function fences(source: string, pre: Annot): { open: string; close: string } {
    const open = source.slice(pre.start, lineEndOf(source, pre.start)).trim()
    if (!OPENING_FENCE.test(open)) return { open: "```", close: "```" }
    const close = source.slice(lineStartOf(source, pre.end), pre.end).trim()
    const marker = OPENING_FENCE.exec(open)?.[1] ?? "```"
    return { open, close: CLOSING_FENCE.test(close) && pre.end > lineEndOf(source, pre.start) ? close : marker }
}

const codeBlock = (source: string, pre: Annot, code: string) => {
    const { open, close } = fences(source, pre)
    return `${open}\n${code.replace(/\n$/, "")}\n${close}`
}

/** Cabeçalho + linha delimitadora da tabela, para uma seleção que começa depois deles. */
function tableHeader(source: string, row: Annot): { text: string; start: number } | null {
    const table = row.node.closest("[data-md-tag='table']")
    const head = table?.querySelector("[data-md-tag='thead'] [data-md-tag='tr']")
    if (!head || head === row.node) return null
    const header = annotOf(head)
    const delimiterStart = lineEndOf(source, header.end) + 1
    const delimiter = source.slice(delimiterStart, lineEndOf(source, delimiterStart))
    return { text: `${source.slice(header.start, header.end)}\n${delimiter}\n`, start: header.start }
}

/**
 * Tira das linhas seguintes o prefixo de contêiner (indentação de lista, `> ` de citação) que a
 * primeira perdeu no corte: o começo da linha até o início do trecho, só com espaços e `>`.
 */
function dedent(source: string, start: number, body: string): string {
    const prefix = /^[ \t>]*/.exec(source.slice(lineStartOf(source, start), start))?.[0] ?? ""
    if (!prefix) return body
    return body
        .split("\n")
        .map((line, index) => (index > 0 && line.startsWith(prefix) ? line.slice(prefix.length) : line))
        .join("\n")
}

/** O intervalo tem conteúdo: texto (fora dos controles) ou mídia anotada, que não tem nó de texto. */
function hasContent(root: Element, range: Range): boolean {
    if (rangeText(range).trim()) return true
    return Array.from(root.querySelectorAll("[data-md-tag='img']")).some((media) => range.intersectsNode(media))
}

const tidy = (text: string) => text.replace(/^(\s*\n)+/, "").replace(/(\n\s*)+$/, "")

/** Markdown do intervalo dentro de `root` (cortado à raiz); `null` sem conteúdo ou sem alinhamento. */
export function markdownOfRange(root: Element, source: string, input: Range): string | null {
    const range = input.cloneRange()
    if (!root.contains(range.startContainer)) range.setStart(root, 0)
    if (!root.contains(range.endContainer)) range.setEnd(root, root.childNodes.length)
    if (range.collapsed || !hasContent(root, range)) return null

    const startPoint = normalize(root, { node: range.startContainer, offset: range.startOffset }, "start")
    const endPoint = normalize(root, { node: range.endContainer, offset: range.endOffset }, "end")
    const startAnc = ancestorsOf(root, startPoint)
    const endAnc = ancestorsOf(root, endPoint)
    const s0 = offsetIn(startAnc[0] ?? rootAnnot(root, source), startPoint, source)
    const e0 = offsetIn(endAnc[0] ?? rootAnnot(root, source), endPoint, source)
    if (s0 === null || e0 === null) return null

    const endNodes = new Set(endAnc.map((annot) => annot.node))
    const common = startAnc.filter((annot) => endNodes.has(annot.node))
    const commonNodes = new Set(common.map((annot) => annot.node))

    // Tudo num bloco de código: o código puro (D2).
    if (common.some((annot) => annot.tag === "pre")) return rangeText(range) || null

    // Tudo num inline: inteiro leva a marcação; em parte, o texto puro (D3).
    // O inline comum mais interno decide; inteiro, sobe enquanto os de fora também estiverem inteiros.
    const commonInlines = common.filter((annot) => INLINE_TAGS.has(annot.tag))
    if (commonInlines.length) {
        const full = (annot: Annot) => !hasTextBefore(annot, startPoint) && !hasTextAfter(annot, endPoint)
        let chosen: Annot | null = null
        for (const inline of commonInlines) {
            if (!full(inline)) break
            chosen = inline
        }
        return chosen ? source.slice(chosen.start, chosen.end) : rangeText(range)
    }

    let start = s0
    let end = e0
    let prefix = ""
    let suffix = ""
    const startSide = startAnc.filter((annot) => !commonNodes.has(annot.node))
    const endSide = endAnc.filter((annot) => !commonNodes.has(annot.node))

    const startCell = startAnc.find((annot) => CELL_TAGS.has(annot.tag))
    const endCell = endAnc.find((annot) => CELL_TAGS.has(annot.tag))
    const crossesCells = (startCell || endCell) && startCell?.node !== endCell?.node
    const startRow = crossesCells ? startAnc.find((annot) => annot.tag === "tr") : undefined
    const endRow = crossesCells ? endAnc.find((annot) => annot.tag === "tr") : undefined

    if (startRow) start = startRow.start
    else {
        const inline = [...startSide].reverse().find((annot) => INLINE_TAGS.has(annot.tag))
        if (inline) {
            if (hasTextBefore(inline, startPoint)) {
                prefix = textInside(range, inline.node)
                start = inline.end
            } else start = inline.start
        }
        for (const block of startSide) {
            if (INLINE_TAGS.has(block.tag)) continue
            if (block.tag === "pre" && hasTextBefore(block, startPoint)) {
                prefix = codeBlock(source, block, textInside(range, block.node))
                start = block.end
                break
            }
            if (hasTextBefore(block, startPoint)) break
            start = Math.min(start, block.start)
        }
    }

    if (endRow) end = endRow.end
    else {
        const inline = [...endSide].reverse().find((annot) => INLINE_TAGS.has(annot.tag))
        if (inline) {
            if (hasTextAfter(inline, endPoint)) {
                suffix = textInside(range, inline.node)
                end = inline.start
            } else end = inline.end
        }
        for (const block of endSide) {
            if (INLINE_TAGS.has(block.tag)) continue
            if (block.tag === "pre" && hasTextAfter(block, endPoint)) {
                suffix = codeBlock(source, block, textInside(range, block.node))
                end = block.start
                break
            }
            if (hasTextAfter(block, endPoint)) break
            end = Math.max(end, block.end)
        }
    }

    // Bloco comum coberto por inteiro (título, item, citação…): leva o marcador.
    for (const block of common) {
        if (CELL_TAGS.has(block.tag)) continue
        if (hasTextBefore(block, startPoint) || hasTextAfter(block, endPoint)) break
        start = Math.min(start, block.start)
        end = Math.max(end, block.end)
    }

    if (startRow) {
        const header = tableHeader(source, startRow)
        if (header && start > header.start) prefix = header.text
    }

    const body = end > start ? dedent(source, start, source.slice(start, end)) : ""
    const text = tidy(`${prefix}${body}${suffix}`)
    return text.trim() ? text : null
}

/** HTML do trecho, sem os controles nem os atributos `data-md-*` (para colar formatado). */
export function cleanHtml(range: Range): string {
    const doc = range.startContainer.ownerDocument ?? document
    const box = doc.createElement("div")
    box.appendChild(range.cloneContents())
    box.querySelectorAll(MD_CONTROL_SELECTOR).forEach((element) => element.remove())
    box.querySelectorAll("*").forEach((element) => {
        for (const name of element.getAttributeNames()) if (name.startsWith("data-md")) element.removeAttribute(name)
    })
    return box.innerHTML
}

const inEditable = (node: Node | null) => {
    const element = node instanceof Element ? node : (node?.parentElement ?? null)
    return Boolean(element?.closest(EDITABLE))
}

/**
 * Conteúdo da área de transferência para a seleção atual: `text` com o Markdown das partes renderizadas
 * (e o texto da tela entre elas, como hoje) e `html` do trecho. `null` quando a seleção não toca um
 * `Markdown`, está num campo editável ou não dá para alinhar — a cópia nativa segue.
 */
export function selectionClipboard(selection: Selection | null): { text: string; html: string } | null {
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null
    if (inEditable(selection.anchorNode) || inEditable(selection.focusNode)) return null
    const range = selection.getRangeAt(0)
    const doc = range.startContainer.ownerDocument ?? document
    const roots = Array.from(doc.querySelectorAll(`[${MD_ROOT_ATTR}]`)).filter((root) => range.intersectsNode(root) && markdownSourceOf(root) !== undefined)
    if (!roots.length) return null

    const pieces: string[] = []
    let cursor: Point = { node: range.startContainer, offset: range.startOffset }
    let touched = false
    const gap = (to: Point) => {
        if (comparePoints(cursor, to) >= 0) return
        const part = doc.createRange()
        part.setStart(cursor.node, cursor.offset)
        part.setEnd(to.node, to.offset)
        const text = part.toString().trim()
        if (text) pieces.push(text)
    }
    for (const root of roots) {
        const inside = doc.createRange()
        inside.selectNodeContents(root)
        if (range.compareBoundaryPoints(Range.START_TO_START, inside) > 0) inside.setStart(range.startContainer, range.startOffset)
        if (range.compareBoundaryPoints(Range.END_TO_END, inside) < 0) inside.setEnd(range.endContainer, range.endOffset)
        if (!hasContent(root, inside)) continue
        if (!root.contains(cursor.node)) gap(before(root))
        const markdown = markdownOfRange(root, markdownSourceOf(root)!, inside)
        if (markdown === null) return null
        pieces.push(markdown)
        touched = true
        cursor = after(root)
    }
    if (!touched) return null
    gap({ node: range.endContainer, offset: range.endOffset })
    return { text: pieces.join("\n\n"), html: cleanHtml(range) }
}
