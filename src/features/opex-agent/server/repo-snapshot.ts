import { Readable } from "node:stream"
import { createGunzip } from "node:zlib"
import { listCentrals } from "@/features/agentic/server/centrals"
import { GITHUB_NO_TOKEN_MESSAGE, GithubError, githubBaseUrl, githubRequest } from "@/features/github/client"
import { normalizeRepo } from "@/features/github/logic"
import { getIntegrationConfig } from "@/lib/integrations/config"
import { loggerFor } from "@/lib/logger"
import { encodePath, looksBinary, REPO_SNAPSHOT_TEXT_MAX_BYTES, REPO_TARBALL_MAX_BYTES, REPO_TEXT_FILE_MAX_BYTES, type RepoFile, type RepoSnapshot } from "../repo-search"
import { readTar } from "./repo-tar"
import { OpexToolError } from "./tools/define"

/**
 * Repositórios do GitHub para o Agente Opex: resolve a branch de consulta e mantém o snapshot de cada
 * commit (tarball baixado uma vez, conteúdo de texto em memória). O SHA é imutável, então o cache só
 * expira por tempo ocioso ou por espaço.
 */

const log = loggerFor({ module: "opex-agent", feature: "github" })

const RAW_TIMEOUT_MS = 120_000
const DEFAULT_BRANCH_TTL_MS = 10 * 60_000
const SNAPSHOT_IDLE_MS = 20 * 60_000
const SNAPSHOT_CACHE_MAX = 4

export type RefSource = "requested" | "central" | "default"

export interface RepoCentralInfo {
    projectName: string
    baseBranch: string
    prTargetBranch: string
}

export interface ResolvedRef {
    repo: string
    ref: string
    /** De onde veio a branch: pedida, base da central ou padrão do repositório. */
    refSource: RefSource
    central: RepoCentralInfo | null
}

export function parseRepo(raw: string): string {
    const repo = normalizeRepo(raw)
    if (!repo) throw new OpexToolError(`Repositório "${raw}" inválido: use o formato dono/nome (veja list_repositories).`)
    return repo
}

/** Central de desenvolvimento do repositório (pelo vínculo projeto ↔ repositório). */
export async function centralForRepo(repo: string): Promise<RepoCentralInfo | null> {
    const central = (await listCentrals()).find((item) => item.repo && normalizeRepo(item.repo) === repo)
    return central ? { projectName: central.projectName, baseBranch: central.config.git.baseBranch, prTargetBranch: central.config.git.prTargetBranch } : null
}

/** Centrais por repositório (para a listagem). */
export async function centralsByRepo(): Promise<Map<string, RepoCentralInfo>> {
    const map = new Map<string, RepoCentralInfo>()
    for (const central of await listCentrals()) {
        const repo = central.repo ? normalizeRepo(central.repo) : null
        if (repo) map.set(repo, { projectName: central.projectName, baseBranch: central.config.git.baseBranch, prTargetBranch: central.config.git.prTargetBranch })
    }
    return map
}

const defaultBranches = new Map<string, { at: number; branch: string }>()

export async function defaultBranchOf(repo: string, signal?: AbortSignal): Promise<string> {
    const cached = defaultBranches.get(repo)
    if (cached && Date.now() - cached.at < DEFAULT_BRANCH_TTL_MS) return cached.branch
    const info = await githubRequest<{ default_branch: string }>(`/repos/${repo}`, { signal, label: "opex: repositório" }).catch((error: unknown) => {
        if (error instanceof GithubError && error.code === "NOT_FOUND") throw new OpexToolError(`Repositório ${repo} não encontrado no GitHub (ou o token não tem acesso).`)
        throw error
    })
    defaultBranches.set(repo, { at: Date.now(), branch: info.default_branch })
    return info.default_branch
}

/**
 * Branch de consulta: a pedida; senão a branch base da central do repositório (Git e PR › Branch base);
 * senão a branch padrão do repositório.
 */
export async function resolveRepoRef(rawRepo: string, ref?: string | null, signal?: AbortSignal): Promise<ResolvedRef> {
    const repo = parseRepo(rawRepo)
    const central = await centralForRepo(repo)
    const requested = ref?.trim()
    if (requested) return { repo, ref: requested, refSource: "requested", central }
    if (central) return { repo, ref: central.baseBranch, refSource: "central", central }
    return { repo, ref: await defaultBranchOf(repo, signal), refSource: "default", central }
}

/** Requisição crua (texto/binário) à API com o token da integração. */
async function githubRaw(path: string, accept: string, signal?: AbortSignal): Promise<Response> {
    const config = await getIntegrationConfig("github")
    if (!config.token) throw new GithubError(GITHUB_NO_TOKEN_MESSAGE, "NOT_CONFIGURED")
    const timeout = AbortSignal.timeout(RAW_TIMEOUT_MS)
    let response: Response
    try {
        response = await fetch(`${await githubBaseUrl()}${path}`, {
            headers: { Accept: accept, Authorization: `Bearer ${config.token}`, "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "opex" },
            redirect: "follow",
            cache: "no-store",
            signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        })
    } catch (error) {
        const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")
        throw new GithubError(timedOut ? "O GitHub não respondeu a tempo" : "Não foi possível conectar ao GitHub", "UNAVAILABLE")
    }
    if (response.ok) return response
    if (response.status === 401) throw new GithubError("Token do GitHub inválido ou expirado: gere outro em Integrações › GitHub", "UNAUTHENTICATED", 401)
    if (response.status === 403 || response.status === 429) throw new GithubError("O GitHub negou o acesso ou o limite de uso foi atingido", "FORBIDDEN", response.status)
    if (response.status === 404 || response.status === 422) throw new GithubError("Não encontrado no GitHub (ou o token não tem acesso)", "NOT_FOUND", response.status)
    throw new GithubError(`O GitHub respondeu HTTP ${response.status}`, "UNAVAILABLE", response.status)
}

/** SHA do commit de uma branch, tag ou SHA. */
export async function resolveSha(repo: string, ref: string, signal?: AbortSignal): Promise<string> {
    try {
        const response = await githubRaw(`/repos/${repo}/commits/${encodePath(ref)}`, "application/vnd.github.sha", signal)
        return (await response.text()).trim()
    } catch (error) {
        if (error instanceof GithubError && error.code === "NOT_FOUND") throw new OpexToolError(`A branch/ref "${ref}" não existe em ${repo} (use list_branches).`)
        throw error
    }
}

async function* limitedBody(body: ReadableStream<Uint8Array>, max: number): AsyncGenerator<Uint8Array> {
    const reader = body.getReader()
    let total = 0
    try {
        while (true) {
            const { done, value } = await reader.read()
            if (done) return
            total += value.length
            if (total > max) throw new OpexToolError(`O repositório é grande demais para baixar (mais de ${Math.round(max / 1024 / 1024)} MB compactado).`)
            yield value
        }
    } finally {
        await reader.cancel().catch(() => undefined)
    }
}

/** Baixa o tarball do commit e monta o snapshot (texto até 2 MB por arquivo; binários só com o caminho). */
async function downloadSnapshot(repo: string, sha: string, signal?: AbortSignal): Promise<RepoSnapshot> {
    const startedAt = Date.now()
    const response = await githubRaw(`/repos/${repo}/tarball/${sha}`, "application/vnd.github+json", signal)
    if (!response.body) throw new GithubError("O GitHub não devolveu o conteúdo do repositório", "UNAVAILABLE")
    const files = new Map<string, RepoFile>()
    const dirs = new Set<string>()
    let textBytes = 0
    const addParents = (path: string) => {
        const parts = path.split("/")
        for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join("/"))
    }
    const source = Readable.from(limitedBody(response.body, REPO_TARBALL_MAX_BYTES))
    const gunzip = createGunzip()
    source.on("error", (error) => gunzip.destroy(error))
    source.pipe(gunzip)
    await readTar(gunzip, {
        wantData: (entry) => entry.size <= REPO_TEXT_FILE_MAX_BYTES && textBytes + entry.size <= REPO_SNAPSHOT_TEXT_MAX_BYTES,
        onEntry: (entry, data) => {
            if (entry.type === "dir") {
                dirs.add(entry.path)
                addParents(entry.path)
                return
            }
            addParents(entry.path)
            let text: string | null = null
            if (data && !looksBinary(data)) {
                text = data.toString("utf8")
                textBytes += data.length
            }
            files.set(entry.path, { path: entry.path, size: entry.size, text })
        },
    })
    log.info({ repo, sha, files: files.size, textBytes, ms: Date.now() - startedAt }, "[opex] snapshot do repositório baixado")
    return { repo, sha, files, dirs, textBytes }
}

const snapshots = new Map<string, { at: number; snapshot: RepoSnapshot }>()
const loading = new Map<string, Promise<RepoSnapshot>>()

function evict(now: number) {
    for (const [key, item] of snapshots) if (now - item.at > SNAPSHOT_IDLE_MS) snapshots.delete(key)
    while (snapshots.size > SNAPSHOT_CACHE_MAX) {
        const oldest = [...snapshots.entries()].sort((a, b) => a[1].at - b[1].at)[0]
        if (!oldest) break
        snapshots.delete(oldest[0])
    }
}

/** Snapshot do commit (do cache ou baixado; downloads simultâneos do mesmo commit são compartilhados). */
export async function loadSnapshot(repo: string, sha: string, signal?: AbortSignal): Promise<RepoSnapshot> {
    const key = `${repo}@${sha}`
    const now = Date.now()
    evict(now)
    const cached = snapshots.get(key)
    if (cached) {
        cached.at = now
        return cached.snapshot
    }
    let pending = loading.get(key)
    if (!pending) {
        // O download não usa o sinal do turno: outro pedido pode estar esperando pelo mesmo commit.
        pending = downloadSnapshot(repo, sha).finally(() => loading.delete(key))
        loading.set(key, pending)
    }
    const snapshot = await (signal ? Promise.race([pending, new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(new OpexToolError("Interrompido")), { once: true }))]) : pending)
    snapshots.set(key, { at: Date.now(), snapshot })
    evict(Date.now())
    return snapshot
}

export interface OpenedRepo extends ResolvedRef {
    sha: string
    snapshot: RepoSnapshot
}

/** Resolve a branch de consulta, o commit e o snapshot. */
export async function openRepo(rawRepo: string, ref: string | null | undefined, signal?: AbortSignal): Promise<OpenedRepo> {
    const resolved = await resolveRepoRef(rawRepo, ref, signal)
    const sha = await resolveSha(resolved.repo, resolved.ref, signal)
    return { ...resolved, sha, snapshot: await loadSnapshot(resolved.repo, sha, signal) }
}

/** Cabeçalho comum das respostas (qual branch e por quê). */
export function refInfo(resolved: ResolvedRef & { sha?: string }) {
    return { repo: resolved.repo, ref: resolved.ref, refSource: resolved.refSource, ...(resolved.sha ? { sha: resolved.sha } : {}) }
}

/** Limpa os caches (testes). */
export function resetRepoCaches() {
    snapshots.clear()
    loading.clear()
    defaultBranches.clear()
}
