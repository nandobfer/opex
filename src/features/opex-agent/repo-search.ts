/**
 * Leitura e busca nos repositórios do GitHub (módulo PURO): filtro da árvore, janela de linhas,
 * busca tipo grep e corte de diffs. O conteúdo vem do snapshot da branch (`server/repo-snapshot.ts`).
 */

export const REPO_TREE_DEFAULT = 500
export const REPO_TREE_MAX = 3000
export const REPO_LINES_DEFAULT = 400
export const REPO_LINES_MAX = 2000
export const REPO_TEXT_MAX = 100_000
export const REPO_SEARCH_DEFAULT = 100
export const REPO_SEARCH_MAX = 500
export const REPO_SEARCH_CONTEXT_MAX = 5
export const REPO_MATCH_LINE_MAX = 300
export const REPO_PATCH_MAX = 6000
export const REPO_PATCH_TOTAL_MAX = 60_000
/** Arquivos de texto maiores que isto ficam fora do snapshot (não dá para ler nem buscar). */
export const REPO_TEXT_FILE_MAX_BYTES = 2 * 1024 * 1024
/** Teto do download compactado de um snapshot. */
export const REPO_TARBALL_MAX_BYTES = 150 * 1024 * 1024
/** Teto de conteúdo de texto guardado por snapshot. */
export const REPO_SNAPSHOT_TEXT_MAX_BYTES = 400 * 1024 * 1024
export const REPO_WRITE_MAX_BYTES = 1024 * 1024

/** Pastas puladas pela busca (salvo quando `path` aponta para dentro delas). */
export const REPO_SEARCH_SKIPPED_DIRS = ["node_modules", ".git", "dist", "build", ".next", "coverage", "vendor", "out"] as const

export interface RepoFile {
    path: string
    size: number
    /** Conteúdo de texto; `null` = binário ou grande demais. */
    text: string | null
}

export interface RepoSnapshot {
    repo: string
    sha: string
    files: Map<string, RepoFile>
    dirs: Set<string>
    /** Bytes de texto guardados (para o limite do cache). */
    textBytes: number
}

/** `src/a b.ts` → `src/a%20b.ts` (cada trecho codificado, barras mantidas). */
export function encodePath(value: string): string {
    return value.split("/").map(encodeURIComponent).join("/")
}

/** Caminho do repositório normalizado: sem barras nas pontas, sem `./`. */
export function normalizeRepoPath(value: string | null | undefined): string {
    return (value ?? "")
        .trim()
        .replace(/\\/g, "/")
        .replace(/^\.\/+/, "")
        .replace(/^\/+|\/+$/g, "")
}

/** Nome de branch aceito pelo git (sem `..`, espaços, `~^:?*[\`, nem barra nas pontas). */
export function isValidBranchName(value: string): boolean {
    if (!value || value.length > 200) return false
    if (/[\s~^:?*[\\]|\.\.|\/\/|@\{/.test(value)) return false
    if (value.startsWith("/") || value.endsWith("/") || value.endsWith(".") || value.endsWith(".lock") || value.startsWith("-")) return false
    return true
}

/** Glob → RegExp (`**`, `*`, `?`, `{a,b}`). Sem barra, casa com o nome do arquivo em qualquer pasta. */
export function globToRegExp(glob: string): RegExp {
    const source = glob.trim()
    const pattern = source.includes("/") ? source.replace(/^\/+/, "") : `**/${source}`
    let out = ""
    let braces = 0
    for (let i = 0; i < pattern.length; i++) {
        const char = pattern[i]!
        if (char === "*") {
            if (pattern[i + 1] === "*") {
                const slash = pattern[i + 2] === "/"
                out += slash ? "(?:.*/)?" : ".*"
                i += slash ? 2 : 1
            } else out += "[^/]*"
        } else if (char === "?") out += "[^/]"
        else if (char === "{") {
            braces++
            out += "(?:"
        } else if (char === "}" && braces > 0) {
            braces--
            out += ")"
        } else if (char === "," && braces > 0) out += "|"
        else out += char.replace(/[.+^$()|[\]\\]/g, "\\$&")
    }
    return new RegExp(`^${out}$`, "i")
}

/** Está dentro de `prefix` (pasta) ou é o próprio caminho? Prefixo vazio = tudo. */
export function isUnder(path: string, prefix: string): boolean {
    return !prefix || path === prefix || path.startsWith(`${prefix}/`)
}

export interface TreeQuery {
    path?: string
    glob?: string
    recursive?: boolean
    limit?: number
}

/** Árvore filtrada: pastas terminam em `/`, em ordem alfabética. */
export function listTree(snapshot: Pick<RepoSnapshot, "files" | "dirs">, query: TreeQuery = {}): { entries: string[]; total: number; truncated: boolean } {
    const prefix = normalizeRepoPath(query.path)
    if (prefix && !snapshot.dirs.has(prefix)) {
        if (snapshot.files.has(prefix)) return { entries: [prefix], total: 1, truncated: false }
        throw new Error(`A pasta "${prefix}" não existe nesta branch`)
    }
    const glob = query.glob?.trim() ? globToRegExp(query.glob) : null
    const recursive = query.recursive ?? true
    const depth = prefix ? prefix.split("/").length + 1 : 1
    const inScope = (path: string) => path !== prefix && isUnder(path, prefix) && (recursive || path.split("/").length === depth)
    const dirs = glob ? [] : [...snapshot.dirs].filter(inScope).map((dir) => `${dir}/`)
    const files = [...snapshot.files.keys()].filter((path) => inScope(path) && (!glob || glob.test(path)))
    const all = [...dirs, ...files].sort((a, b) => a.localeCompare(b))
    const limit = Math.min(Math.max(query.limit ?? REPO_TREE_DEFAULT, 1), REPO_TREE_MAX)
    return { entries: all.slice(0, limit), total: all.length, truncated: all.length > limit }
}

/** Binário: tem byte nulo nos primeiros 8 KB. */
export function looksBinary(bytes: Uint8Array): boolean {
    const end = Math.min(bytes.length, 8000)
    for (let i = 0; i < end; i++) if (bytes[i] === 0) return true
    return false
}

export interface LineWindow {
    startLine: number
    endLine: number
    totalLines: number
    truncated: boolean
    /** Linhas numeradas (`12: código`). */
    text: string
}

/** Janela de linhas numeradas, cortada também por caracteres. */
export function lineWindow(text: string, startLine = 1, maxLines = REPO_LINES_DEFAULT): LineWindow {
    const lines = text.split(/\r?\n/)
    if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop()
    const totalLines = lines.length
    const start = Math.min(Math.max(1, Math.trunc(startLine)), Math.max(totalLines, 1))
    const count = Math.min(Math.max(1, Math.trunc(maxLines)), REPO_LINES_MAX)
    const out: string[] = []
    let chars = 0
    let end = start - 1
    for (let index = start - 1; index < totalLines && out.length < count; index++) {
        const line = `${index + 1}: ${lines[index]}`
        if (chars + line.length > REPO_TEXT_MAX && out.length > 0) break
        out.push(line)
        chars += line.length + 1
        end = index + 1
    }
    return { startLine: start, endLine: end, totalLines, truncated: end < totalLines, text: out.join("\n") }
}

export interface SearchQuery {
    query: string
    regex?: boolean
    caseSensitive?: boolean
    path?: string
    glob?: string
    contextLines?: number
    limit?: number
}

export interface SearchMatch {
    path: string
    line: number
    text: string
    before?: string[]
    after?: string[]
}

export interface SearchResult {
    matches: SearchMatch[]
    filesScanned: number
    filesMatched: number
    /** Arquivos fora da busca (binários ou grandes demais). */
    filesSkipped: number
    truncated: boolean
}

function buildMatcher(query: SearchQuery): RegExp {
    const text = query.query
    if (!text) throw new Error("Informe o texto da busca")
    const source = query.regex ? text : text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    try {
        return new RegExp(source, query.caseSensitive ? "" : "i")
    } catch (error) {
        throw new Error(`Expressão regular inválida: ${error instanceof Error ? error.message : String(error)}`)
    }
}

const clipLine = (line: string) => (line.length > REPO_MATCH_LINE_MAX ? `${line.slice(0, REPO_MATCH_LINE_MAX)}…` : line)

function skippedByDefault(path: string, prefix: string): boolean {
    const parts = path.split("/").slice(0, -1)
    return parts.some((part) => (REPO_SEARCH_SKIPPED_DIRS as readonly string[]).includes(part) && !isUnder(prefix, parts.slice(0, parts.indexOf(part) + 1).join("/")))
}

/** Busca tipo grep nos arquivos de texto do snapshot. */
export function searchFiles(files: Iterable<RepoFile>, query: SearchQuery): SearchResult {
    const matcher = buildMatcher(query)
    const prefix = normalizeRepoPath(query.path)
    const glob = query.glob?.trim() ? globToRegExp(query.glob) : null
    const context = Math.min(Math.max(query.contextLines ?? 0, 0), REPO_SEARCH_CONTEXT_MAX)
    const limit = Math.min(Math.max(query.limit ?? REPO_SEARCH_DEFAULT, 1), REPO_SEARCH_MAX)
    const sorted = [...files].filter((file) => isUnder(file.path, prefix) && (!glob || glob.test(file.path)) && !skippedByDefault(file.path, prefix)).sort((a, b) => a.path.localeCompare(b.path))
    const result: SearchResult = { matches: [], filesScanned: 0, filesMatched: 0, filesSkipped: 0, truncated: false }
    for (const file of sorted) {
        if (file.text === null) {
            result.filesSkipped++
            continue
        }
        result.filesScanned++
        const lines = file.text.split(/\r?\n/)
        let matched = false
        for (let index = 0; index < lines.length; index++) {
            if (!matcher.test(lines[index]!)) continue
            if (result.matches.length >= limit) {
                result.truncated = true
                return result
            }
            if (!matched) {
                matched = true
                result.filesMatched++
            }
            const match: SearchMatch = { path: file.path, line: index + 1, text: clipLine(lines[index]!) }
            if (context) {
                match.before = lines.slice(Math.max(0, index - context), index).map(clipLine)
                match.after = lines.slice(index + 1, index + 1 + context).map(clipLine)
            }
            result.matches.push(match)
        }
    }
    return result
}

/** Diffs cortados por arquivo e no total, para não estourar o contexto do modelo. */
export function clipPatches<T extends { patch?: string | null }>(files: readonly T[], perFile = REPO_PATCH_MAX, total = REPO_PATCH_TOTAL_MAX): (Omit<T, "patch"> & { patch: string | null })[] {
    let used = 0
    return files.map((file) => {
        const raw = file.patch ?? null
        if (raw === null) return { ...file, patch: null }
        const budget = Math.max(0, Math.min(perFile, total - used))
        const patch = raw.length <= budget ? raw : budget > 0 ? `${raw.slice(0, budget)}\n…(diff cortado: +${(raw.length - budget).toLocaleString("pt-BR")} caracteres)` : "(diff omitido: limite total atingido)"
        used += Math.min(raw.length, budget)
        return { ...file, patch }
    })
}
