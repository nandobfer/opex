import { githubGetWithPublicFallback } from "@/features/github/client"
import { toGithubDomainError } from "@/features/github/server/errors"
import { DomainError } from "@/lib/api/route"
import { loggerFor } from "@/lib/logger"
import { OPEX_SKILL_VERSION_BUDGET_MS, OPEX_SKILL_VERSION_CACHE_MS, OPEX_SKILL_VERSION_FAILURE_CACHE_MS } from "./constants"

/**
 * Leitura de skills de repositórios do GitHub (OPE-153) — SOMENTE servidor. Usa a integração GitHub
 * (token para repositórios privados; sem token cadastrado, modo anônimo só para públicos). Descoberta pela
 * árvore recursiva (`git/trees`), conteúdo pelos blobs (`git/blobs`). Hash = SHA da árvore da pasta.
 */

const log = loggerFor({ module: "opex-skills" })

export interface RepoTreeEntry {
    path: string
    type: "blob" | "tree" | "commit"
    sha: string
    size?: number
}

export interface RepoTree {
    sha: string
    truncated: boolean
    entries: RepoTreeEntry[]
}

export interface SkillFolderContent {
    markdown: string
    files: { path: string; content: Buffer; binary: boolean; size: number }[]
    hash: string
}

const SKIPPED_SEGMENT = (segment: string) => segment.startsWith(".") || segment === "node_modules"

/** Pastas com `SKILL.md` (uma pasta com `SKILL.md` é uma skill; não se procura outra dentro dela). Puro. */
export function findSkillFolders(tree: Pick<RepoTree, "entries">, base: string | null = null): string[] {
    const folders = tree.entries
        .filter((entry) => entry.type === "blob" && (entry.path === "SKILL.md" || entry.path.endsWith("/SKILL.md")))
        .map((entry) => entry.path.slice(0, -"SKILL.md".length).replace(/\/$/, ""))
        .filter((folder) => !base || folder === base || folder.startsWith(`${base}/`))
        // Pastas ocultas/node_modules só são ignoradas abaixo da pasta pedida na URL (ex.: `.claude/skills/x` vale).
        .filter((folder) => !(base ? folder.slice(base.length) : folder).split("/").some(SKIPPED_SEGMENT))
        .sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b))
    const kept: string[] = []
    for (const folder of folders) if (!kept.some((parent) => parent === "" || folder.startsWith(`${parent}/`))) kept.push(folder)
    return kept.sort((a, b) => a.localeCompare(b))
}

/** SHA da árvore da pasta (`""` = raiz). Puro. */
export function folderHashOf(tree: RepoTree, folder: string): string | null {
    if (!folder) return tree.sha
    return tree.entries.find((entry) => entry.type === "tree" && entry.path === folder)?.sha ?? null
}

/** Blobs da pasta, com caminho relativo a ela. Puro. */
export function folderBlobs(tree: Pick<RepoTree, "entries">, folder: string): { path: string; sha: string }[] {
    const prefix = folder ? `${folder}/` : ""
    return tree.entries.filter((entry) => entry.type === "blob" && entry.path.startsWith(prefix)).map((entry) => ({ path: entry.path.slice(prefix.length), sha: entry.sha }))
}

/** Binário: tem byte nulo ou não é UTF-8 válido. Puro. */
export function looksBinary(content: Buffer): boolean {
    if (content.subarray(0, 8000).includes(0)) return true
    try {
        new TextDecoder("utf-8", { fatal: true }).decode(content)
        return false
    } catch {
        return true
    }
}

async function get<T>(path: string): Promise<T> {
    try {
        return await githubGetWithPublicFallback<T>(path)
    } catch (error) {
        return toGithubDomainError(error)
    }
}

/** Árvore recursiva do repositório na ref (ou na branch padrão). */
export async function fetchRepoTree(repo: string, ref: string | null): Promise<RepoTree> {
    const body = await get<{ sha: string; truncated?: boolean; tree?: RepoTreeEntry[] }>(`/repos/${repo}/git/trees/${encodeURIComponent(ref ?? "HEAD")}?recursive=1`)
    return { sha: body.sha, truncated: body.truncated === true, entries: body.tree ?? [] }
}

interface CacheEntry {
    at: number
    /** Validade da entrada: 10 min para a árvore; curta para uma falha memorizada. */
    ttl: number
    value: Promise<RepoTree>
}
const globalForCache = globalThis as unknown as { opexSkillTreeCache?: Map<string, CacheEntry> }
const treeCache = (globalForCache.opexSkillTreeCache ??= new Map<string, CacheEntry>())

export function clearSkillTreeCache(): void {
    treeCache.clear()
}

/** Árvore com cache de 10 min (verificação de "Com atualização" na lista). */
export function cachedRepoTree(repo: string, ref: string | null, refresh = false): Promise<RepoTree> {
    const key = `${repo}@${ref ?? "HEAD"}`
    const hit = treeCache.get(key)
    if (hit && !refresh && Date.now() - hit.at < hit.ttl) return hit.value
    const value = fetchRepoTree(repo, ref).catch((error: unknown) => {
        // Falha memorizada por pouco tempo: GitHub lento/fora não é consultado de novo a cada lista.
        const failed = Promise.reject(error)
        failed.catch(() => undefined)
        treeCache.set(key, { at: Date.now(), ttl: OPEX_SKILL_VERSION_FAILURE_CACHE_MS, value: failed })
        throw error
    })
    treeCache.set(key, { at: Date.now(), ttl: OPEX_SKILL_VERSION_CACHE_MS, value })
    return value
}

const withinBudget = <T>(promise: Promise<T>, ms: number): Promise<T | typeof BUDGET_EXCEEDED> => {
    promise.catch(() => undefined)
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<typeof BUDGET_EXCEEDED>((resolve) => (timer = setTimeout(() => resolve(BUDGET_EXCEEDED), ms)))
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}
const BUDGET_EXCEEDED = Symbol("budget")

/**
 * Hash disponível de várias pastas, uma chamada por repositório/ref. Falha → `null` (não verificado).
 * A lista não espera o GitHub além de `OPEX_SKILL_VERSION_BUDGET_MS`: passou disso, responde "não
 * verificado" e a consulta segue em segundo plano, enchendo o cache para a próxima leitura. Com
 * `budget = false` ("Atualizar todos"), espera a resposta do GitHub.
 */
export async function availableHashes(items: { key: string; repo: string; ref: string | null; path: string }[], refresh = false, budget = true): Promise<Map<string, string | null>> {
    const out = new Map<string, string | null>()
    const groups = new Map<string, typeof items>()
    for (const item of items) groups.set(`${item.repo}@${item.ref ?? ""}`, [...(groups.get(`${item.repo}@${item.ref ?? ""}`) ?? []), item])
    await Promise.all(
        [...groups.values()].map(async (group) => {
            const first = group[0]!
            try {
                const tree = budget ? await withinBudget(cachedRepoTree(first.repo, first.ref, refresh), OPEX_SKILL_VERSION_BUDGET_MS) : await cachedRepoTree(first.repo, first.ref, refresh)
                if (tree === BUDGET_EXCEEDED) {
                    for (const item of group) out.set(item.key, null)
                    return
                }
                for (const item of group) out.set(item.key, folderHashOf(tree, item.path))
            } catch (error) {
                log.warn({ repo: first.repo, err: error instanceof Error ? error.message : String(error) }, "[opex-skills] Falha ao verificar atualização no GitHub")
                for (const item of group) out.set(item.key, null)
            }
        }),
    )
    return out
}

async function mapLimit<T, R>(items: readonly T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
    const out: R[] = new Array(items.length)
    let next = 0
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) {
            const index = next++
            out[index] = await run(items[index]!)
        }
    })
    await Promise.all(workers)
    return out
}

export async function readBlob(repo: string, sha: string): Promise<Buffer> {
    const body = await get<{ content?: string; encoding?: string }>(`/repos/${repo}/git/blobs/${sha}`)
    return Buffer.from(body.content ?? "", body.encoding === "base64" ? "base64" : "utf8")
}

/** Texto do `SKILL.md` de uma pasta. */
export async function readSkillMarkdown(repo: string, tree: RepoTree, folder: string): Promise<string> {
    const path = folder ? `${folder}/SKILL.md` : "SKILL.md"
    const entry = tree.entries.find((item) => item.type === "blob" && item.path === path)
    if (!entry) throw new DomainError(404, `Nenhum SKILL.md em ${folder || "raiz do repositório"}`, "OPEX_SKILL_NO_SKILL_MD")
    return (await readBlob(repo, entry.sha)).toString("utf8")
}

/** Pasta inteira da skill: `SKILL.md`, arquivos de apoio (binários marcados) e o hash. */
export async function readSkillFolder(repo: string, tree: RepoTree, folder: string): Promise<SkillFolderContent> {
    const hash = folderHashOf(tree, folder)
    if (!hash) throw new DomainError(404, `A pasta ${folder || "raiz"} não existe mais no repositório ${repo}`, "OPEX_SKILL_FOLDER_GONE")
    const blobs = folderBlobs(tree, folder)
    const contents = await mapLimit(blobs, 6, async (blob) => ({ path: blob.path, content: await readBlob(repo, blob.sha) }))
    const skill = contents.find((item) => item.path === "SKILL.md")
    if (!skill) throw new DomainError(404, `Nenhum SKILL.md em ${folder || "raiz do repositório"}`, "OPEX_SKILL_NO_SKILL_MD")
    const files = contents
        .filter((item) => item.path !== "SKILL.md")
        .map((item) => ({ path: item.path, content: item.content, binary: looksBinary(item.content), size: item.content.byteLength }))
    return { markdown: skill.content.toString("utf8"), files, hash }
}

export { mapLimit as mapSkillsLimit }
