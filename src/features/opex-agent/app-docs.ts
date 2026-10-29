/**
 * Documentação do app (`aicontext/**.md`) lida pelo Agente Opex: lógica PURA de caminho, seções,
 * janelas de linhas e busca. A leitura em disco fica em `server/app-docs.ts`.
 */

export const APP_DOCS_DIR = "aicontext"
/** Linhas por leitura (padrão e máximo) e teto de caracteres devolvidos ao modelo. */
export const APP_DOC_DEFAULT_LINES = 200
export const APP_DOC_MAX_LINES = 600
export const APP_DOC_MAX_CHARS = 24_000
export const APP_DOC_SEARCH_DEFAULT_LIMIT = 10
export const APP_DOC_SEARCH_MAX_LIMIT = 30

export interface AppDocHeading {
    level: number
    text: string
    /** Linha do título (1-based). */
    line: number
}

export interface AppDocFile {
    path: string
    content: string
}

export interface AppDocSearchHit {
    path: string
    line: number
    section: string | null
    snippet: string
    score: number
}

/**
 * Caminho relativo seguro dentro de `aicontext/` (POSIX, sem `./`), ou `null` quando for absoluto,
 * subir de pasta, tiver byte nulo ou não for `.md`. Aceita o prefixo `aicontext/`.
 */
export function normalizeDocPath(input: string): string | null {
    const raw = input.trim().replace(/\\/g, "/")
    if (!raw || raw.includes("\0") || raw.startsWith("/") || /^[a-zA-Z]:/.test(raw)) return null
    const parts: string[] = []
    for (const part of raw.split("/")) {
        if (!part || part === ".") continue
        if (part === "..") return null
        parts.push(part)
    }
    if (parts[0] === APP_DOCS_DIR) parts.shift()
    const path = parts.join("/")
    return path.toLowerCase().endsWith(".md") ? path : null
}

/** Pasta relativa segura (para filtrar a listagem); `""` = raiz; `null` = inválida. */
export function normalizeDocDir(input: string | undefined): string | null {
    if (!input) return ""
    const raw = input.trim().replace(/\\/g, "/")
    if (raw.includes("\0") || raw.startsWith("/")) return null
    const parts: string[] = []
    for (const part of raw.split("/")) {
        if (!part || part === ".") continue
        if (part === "..") return null
        parts.push(part)
    }
    if (parts[0] === APP_DOCS_DIR) parts.shift()
    return parts.join("/")
}

/** Títulos Markdown (`#` a `######`), ignorando blocos de código. */
export function parseHeadings(content: string): AppDocHeading[] {
    const headings: AppDocHeading[] = []
    let fenced = false
    content.split("\n").forEach((line, index) => {
        if (/^\s*(```|~~~)/.test(line)) fenced = !fenced
        if (fenced) return
        const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line)
        if (match) headings.push({ level: match[1]!.length, text: match[2]!.trim(), line: index + 1 })
    })
    return headings
}

/** Título do documento: o primeiro `#`, senão o primeiro título qualquer, senão o nome do arquivo. */
export function docTitle(path: string, headings: readonly AppDocHeading[]): string {
    return (headings.find((heading) => heading.level === 1) ?? headings[0])?.text ?? path.split("/").pop()!.replace(/\.md$/i, "")
}

/** Texto sem acentos e em minúsculas (busca e comparação de títulos). */
export function foldText(text: string): string {
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
}

/**
 * Faixa de linhas (1-based, inclusiva) da seção cujo título casa com `section` (sem acento/caixa;
 * exato tem prioridade sobre "contém"): do título até antes do próximo título de nível igual ou acima.
 */
export function findSection(content: string, section: string): { start: number; end: number; heading: AppDocHeading } | null {
    const headings = parseHeadings(content)
    const wanted = foldText(section.replace(/^#+\s*/, "").trim())
    if (!wanted) return null
    const heading = headings.find((item) => foldText(item.text) === wanted) ?? headings.find((item) => foldText(item.text).includes(wanted))
    if (!heading) return null
    const next = headings.find((item) => item.line > heading.line && item.level <= heading.level)
    const total = content.split("\n").length
    return { start: heading.line, end: next ? next.line - 1 : total, heading }
}

/** Janela de linhas numeradas, cortada também pelo teto de caracteres. */
export function sliceLines(content: string, startLine: number, maxLines: number, maxChars = APP_DOC_MAX_CHARS, endLine?: number) {
    const lines = content.split("\n")
    const totalLines = lines.length
    const start = Math.min(Math.max(1, Math.floor(startLine)), Math.max(1, totalLines))
    const last = Math.min(totalLines, endLine ?? totalLines, start + Math.max(1, Math.floor(maxLines)) - 1)
    const out: string[] = []
    let chars = 0
    let lineNo = start
    for (; lineNo <= last; lineNo++) {
        const text = `${lineNo}: ${lines[lineNo - 1] ?? ""}`
        if (out.length && chars + text.length + 1 > maxChars) break
        out.push(text)
        chars += text.length + 1
    }
    const endShown = lineNo - 1
    return { startLine: start, endLine: endShown, totalLines, truncated: endShown < (endLine ?? totalLines), text: out.join("\n") }
}

function tokensOf(query: string): string[] {
    return [...new Set(foldText(query).split(/[^\p{L}\p{N}_-]+/u).filter((token) => token.length >= 2))]
}

/**
 * Busca por palavras (sem acento/caixa) linha a linha. Pontua cada linha pelas palavras distintas
 * encontradas (título conta em dobro; frase inteira dá bônus) e devolve as melhores com a seção.
 */
export function searchDocs(files: readonly AppDocFile[], query: string, limit = APP_DOC_SEARCH_DEFAULT_LIMIT): AppDocSearchHit[] {
    const tokens = tokensOf(query)
    if (!tokens.length) return []
    const phrase = foldText(query.trim())
    const hits: AppDocSearchHit[] = []
    for (const file of files) {
        const headings = parseHeadings(file.content)
        file.content.split("\n").forEach((line, index) => {
            const folded = foldText(line)
            const matched = tokens.filter((token) => folded.includes(token)).length
            if (!matched) return
            const lineNo = index + 1
            const isHeading = headings.some((heading) => heading.line === lineNo)
            const pathBonus = tokens.some((token) => foldText(file.path).includes(token)) ? 0.5 : 0
            const score = matched * (isHeading ? 2 : 1) + (tokens.length > 1 && folded.includes(phrase) ? tokens.length : 0) + pathBonus
            const section = [...headings].reverse().find((heading) => heading.line <= lineNo)?.text ?? null
            hits.push({ path: file.path, line: lineNo, section, snippet: line.trim().slice(0, 300), score })
        })
    }
    return hits.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path) || a.line - b.line).slice(0, Math.max(1, limit))
}
