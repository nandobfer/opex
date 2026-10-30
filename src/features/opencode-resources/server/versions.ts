import { githubRequest } from "@/features/github/client"
import { loggerFor } from "@/lib/logger"
import { VERSION_CACHE_MS } from "../constants"
import { latestStable } from "../versions"

/**
 * Versões disponíveis — SOMENTE servidor. npm (registry público) para plugins, MCPs de pacote e o
 * próprio OpenCode; GitHub (integração, com fallback anônimo) para o hash das pastas das skills.
 * Cache de 10 min; falha vira `null` (a tela mostra "—").
 */

const log = loggerFor({ module: "opencode-resources" })

interface CacheEntry<T> {
    at: number
    value: Promise<T>
}

const globalForCache = globalThis as unknown as { opencodeVersionCache?: Map<string, CacheEntry<unknown>> }
const cache = (globalForCache.opencodeVersionCache ??= new Map<string, CacheEntry<unknown>>())

function cached<T>(key: string, load: () => Promise<T>, refresh = false): Promise<T> {
    const hit = cache.get(key) as CacheEntry<T> | undefined
    if (hit && !refresh && Date.now() - hit.at < VERSION_CACHE_MS) return hit.value
    const value = load().catch((error: unknown) => {
        cache.delete(key)
        throw error
    })
    cache.set(key, { at: Date.now(), value })
    return value
}

export function clearVersionCache(): void {
    cache.clear()
}

export interface NpmPackageInfo {
    versions: string[]
    distTags: Record<string, string>
}

export async function fetchNpmPackage(name: string, refresh = false): Promise<NpmPackageInfo | null> {
    try {
        return await cached(
            `npm:${name}`,
            async () => {
                const res = await fetch(`https://registry.npmjs.org/${name.replace("/", "%2f")}`, { headers: { Accept: "application/vnd.npm.install-v1+json" }, cache: "no-store", signal: AbortSignal.timeout(10_000) })
                if (!res.ok) throw new Error(`HTTP ${res.status}`)
                const body = (await res.json()) as { versions?: Record<string, unknown>; "dist-tags"?: Record<string, string> }
                return { versions: Object.keys(body.versions ?? {}), distTags: body["dist-tags"] ?? {} }
            },
            refresh,
        )
    } catch (error) {
        log.warn({ name, err: error instanceof Error ? error.message : String(error) }, "[opencode-resources] Falha ao consultar o npm")
        return null
    }
}

/** Versão disponível de um especificador npm: a dist-tag pedida (`@next`) ou a `latest`. */
export async function npmAvailable(name: string, range: string | null, refresh = false): Promise<string | null> {
    const info = await fetchNpmPackage(name, refresh)
    if (!info) return null
    if (range && info.distTags[range]) return info.distTags[range]!
    return info.distTags.latest ?? latestStable(info.versions)
}

interface RepoTree {
    sha: string
    folders: Record<string, string>
}

async function githubGet<T>(path: string): Promise<T> {
    try {
        return await githubRequest<T>(path)
    } catch {
        const res = await fetch(`https://api.github.com${path}`, { headers: { Accept: "application/vnd.github+json" }, cache: "no-store", signal: AbortSignal.timeout(10_000) })
        if (!res.ok) throw new Error(`GitHub HTTP ${res.status}`)
        return (await res.json()) as T
    }
}

/** Hash (SHA da árvore no git) de uma pasta do repositório — o mesmo `skillFolderHash` da CLI `skills`. */
export async function githubFolderHash(repo: string, folder: string, refresh = false): Promise<string | null> {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return null
    try {
        const tree = await cached<RepoTree>(
            `gh:${repo}`,
            async () => {
                const body = await githubGet<{ sha: string; tree?: { path: string; type: string; sha: string }[] }>(`/repos/${repo}/git/trees/HEAD?recursive=1`)
                const folders: Record<string, string> = {}
                for (const entry of body.tree ?? []) if (entry.type === "tree") folders[entry.path] = entry.sha
                return { sha: body.sha, folders }
            },
            refresh,
        )
        return folder ? (tree.folders[folder] ?? null) : tree.sha
    } catch (error) {
        log.warn({ repo, err: error instanceof Error ? error.message : String(error) }, "[opencode-resources] Falha ao consultar o GitHub")
        return null
    }
}
