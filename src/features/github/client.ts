import { getIntegrationConfig } from "@/lib/integrations/config"
import { integrationDebug } from "@/lib/integrations/debug"
import { GITHUB_DEFAULT_API_URL } from "@/lib/integrations/catalog"

/**
 * Cliente da API REST do GitHub — SOMENTE servidor. Usa a URL e o token (PAT) salvos em
 * Integrações › GitHub. O token nunca sai do servidor nem vai para o debug.
 */

export const GITHUB_TIMEOUT_MS = 30_000

export type GithubErrorCode = "NOT_CONFIGURED" | "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "REJECTED" | "RATE_LIMITED" | "UNAVAILABLE"

export class GithubError extends Error {
    constructor(
        message: string,
        readonly code: GithubErrorCode,
        readonly status = 0,
    ) {
        super(message)
        this.name = "GithubError"
    }
}

export const GITHUB_NO_TOKEN_MESSAGE = "GitHub sem token: cadastre um token de acesso em Integrações › GitHub"

export interface GithubRequestOptions {
    method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"
    body?: unknown
    /** ETag da última leitura: 304 devolve `notModified` (não gasta o limite de uso). */
    etag?: string | null
    accept?: string
    signal?: AbortSignal
    label?: string
}

export interface GithubResponse<T> {
    data: T
    status: number
    etag: string | null
    notModified: boolean
    /** Próxima página (`Link: rel="next"`). */
    next: string | null
    rateRemaining: number | null
}

function nextLink(header: string | null): string | null {
    if (!header) return null
    const match = header.split(",").find((part) => part.includes('rel="next"'))
    return match?.match(/<([^>]+)>/)?.[1] ?? null
}

export async function githubBaseUrl(): Promise<string> {
    const config = await getIntegrationConfig("github")
    return (config.apiUrl || GITHUB_DEFAULT_API_URL).replace(/\/+$/, "")
}

/** Chama a API (`path` relativo ou URL absoluta da própria API) e devolve o JSON com metadados. */
export async function githubRequestFull<T>(path: string, options: GithubRequestOptions = {}): Promise<GithubResponse<T>> {
    const config = await getIntegrationConfig("github")
    if (!config.token) throw new GithubError(GITHUB_NO_TOKEN_MESSAGE, "NOT_CONFIGURED")
    const base = (config.apiUrl || GITHUB_DEFAULT_API_URL).replace(/\/+$/, "")
    const url = /^https?:\/\//.test(path) ? path : `${base}${path}`
    const method = options.method ?? "GET"
    const dbg = integrationDebug("github")
    const label = options.label ?? path
    const headers: Record<string, string> = {
        Accept: options.accept ?? "application/vnd.github+json",
        Authorization: `Bearer ${config.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "opex",
    }
    if (options.body !== undefined) headers["Content-Type"] = "application/json"
    if (options.etag) headers["If-None-Match"] = options.etag

    dbg.request(`${label}: ${method} ${url}`)
    const startedAt = Date.now()
    let response: Response
    try {
        const timeout = AbortSignal.timeout(GITHUB_TIMEOUT_MS)
        response = await fetch(url, {
            method,
            headers,
            body: options.body === undefined ? undefined : JSON.stringify(options.body),
            cache: "no-store",
            signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
        })
    } catch (error) {
        dbg.error(`${label}: sem resposta após ${Date.now() - startedAt} ms`, error)
        const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")
        throw new GithubError(timedOut ? "O GitHub não respondeu a tempo" : "Não foi possível conectar ao GitHub", "UNAVAILABLE")
    }
    const rate = response.headers.get("x-ratelimit-remaining")
    const rateRemaining = rate === null ? null : Number(rate)
    dbg.response(`${label}: HTTP ${response.status} em ${Date.now() - startedAt} ms`, { status: response.status, rateRemaining })

    const meta = { status: response.status, etag: response.headers.get("etag"), next: nextLink(response.headers.get("link")), rateRemaining }
    if (response.status === 304) return { ...meta, data: null as T, notModified: true }

    const body = (await response.json().catch(() => null)) as unknown
    if (response.ok) return { ...meta, data: body as T, notModified: false }

    const detail = body && typeof body === "object" && typeof (body as { message?: unknown }).message === "string" ? (body as { message: string }).message : null
    if (response.status === 401) throw new GithubError("Token do GitHub inválido ou expirado: gere outro em Integrações › GitHub", "UNAUTHENTICATED", 401)
    if ((response.status === 403 || response.status === 429) && rateRemaining === 0) {
        throw new GithubError("Limite de uso da API do GitHub atingido: tente de novo mais tarde", "RATE_LIMITED", response.status)
    }
    if (response.status === 403) throw new GithubError(`O GitHub negou o acesso${detail ? `: ${detail}` : ""} (confira as permissões do token)`, "FORBIDDEN", 403)
    if (response.status === 404) throw new GithubError("Não encontrado no GitHub (ou o token não tem acesso)", "NOT_FOUND", 404)
    if (response.status >= 500) throw new GithubError(`O GitHub respondeu HTTP ${response.status}`, "UNAVAILABLE", response.status)
    throw new GithubError(detail ? `O GitHub recusou: ${detail}` : `O GitHub recusou a requisição (HTTP ${response.status})`, "REJECTED", response.status)
}

export async function githubRequest<T>(path: string, options: GithubRequestOptions = {}): Promise<T> {
    return (await githubRequestFull<T>(path, options)).data
}

/** Endpoint GraphQL a partir da URL da API REST (`…/api/v3` do GHES vira `…/api/graphql`). */
export function graphqlUrlOf(apiUrl: string): string {
    const base = apiUrl.replace(/\/+$/, "")
    return /\/api\/v3$/.test(base) ? base.replace(/\/v3$/, "/graphql") : `${base}/graphql`
}

/** Consulta GraphQL. Erros do GraphQL (resposta 200 com `errors`) viram `GithubError`. */
export async function githubGraphql<T>(query: string, variables: Record<string, unknown> = {}, options: Pick<GithubRequestOptions, "signal" | "label"> = {}): Promise<T> {
    const url = graphqlUrlOf(await githubBaseUrl())
    const body = await githubRequest<{ data?: T | null; errors?: { type?: string; message?: string }[] }>(url, { ...options, method: "POST", body: { query, variables } })
    const errors = body?.errors ?? []
    if (errors.length && !body?.data) {
        const first = errors[0]!
        throw new GithubError(first.type === "NOT_FOUND" ? "Não encontrado no GitHub (ou o token não tem acesso)" : `O GitHub recusou a consulta: ${first.message ?? "erro no GraphQL"}`, first.type === "NOT_FOUND" ? "NOT_FOUND" : "REJECTED")
    }
    return body!.data as T
}

/** Todas as páginas (até `maxPages`) de uma listagem. */
export async function githubPaginate<T>(path: string, options: GithubRequestOptions & { maxPages?: number } = {}): Promise<T[]> {
    const items: T[] = []
    let url: string | null = path
    for (let page = 0; url && page < (options.maxPages ?? 10); page++) {
        const response: GithubResponse<T[]> = await githubRequestFull<T[]>(url, options)
        items.push(...(response.data ?? []))
        url = response.next
    }
    return items
}

const MEDIA_HOSTS = [/^github\.com$/, /(^|\.)githubusercontent\.com$/, /(^|\.)githubassets\.com$/]

export function isGithubMediaUrl(raw: string): boolean {
    try {
        const url = new URL(raw)
        return url.protocol === "https:" && MEDIA_HOSTS.some((host) => host.test(url.hostname))
    } catch {
        return false
    }
}

export const GITHUB_MEDIA_MAX_BYTES = 10 * 1024 * 1024

/**
 * Baixa uma imagem do GitHub (URL assinada do `body_html` ou anexo direto). O token só vai para
 * `github.com` (anexos de repositório privado); URLs assinadas não precisam dele.
 */
export async function githubDownload(raw: string, signal?: AbortSignal): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
    if (!isGithubMediaUrl(raw)) return null
    const config = await getIntegrationConfig("github")
    const host = new URL(raw).hostname
    const headers: Record<string, string> = { "User-Agent": "opex" }
    if (host === "github.com" && config.token) headers.Authorization = `Bearer ${config.token}`
    try {
        const timeout = AbortSignal.timeout(GITHUB_TIMEOUT_MS)
        const response = await fetch(raw, { headers, redirect: "follow", cache: "no-store", signal: signal ? AbortSignal.any([signal, timeout]) : timeout })
        if (!response.ok) return null
        const contentType = response.headers.get("content-type") ?? "application/octet-stream"
        if (!contentType.startsWith("image/")) return null
        const length = Number(response.headers.get("content-length") ?? 0)
        if (length > GITHUB_MEDIA_MAX_BYTES) return null
        const bytes = await response.arrayBuffer()
        if (bytes.byteLength > GITHUB_MEDIA_MAX_BYTES) return null
        return { bytes, contentType }
    } catch {
        return null
    }
}
