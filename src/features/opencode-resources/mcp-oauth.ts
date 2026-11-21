/**
 * OAuth dos MCPs remotos do OpenCode (OPE-176) — módulo puro. O OpenCode 2.x conclui o login de um MCP
 * num servidor temporário NO HOST (`http://127.0.0.1:<porta>/callback`, porta no `redirect_uri` da
 * URL de login). Abrindo o Opex de outra máquina, o navegador não alcança esse endereço: o dono cola
 * a URL da barra de endereço e o Opex a repassa ao loopback do host — só se for exatamente o retorno
 * da tentativa (mesmo host de loopback, porta, caminho e `state`).
 */

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"])

export interface OauthCallbackTarget {
    /** `http://127.0.0.1:<porta>/callback` (sem query). */
    redirectUri: string
    port: number
    path: string
    state: string | null
}

/** `redirect_uri` e `state` da URL de login devolvida pelo OpenCode (`null` se o retorno não é no loopback). */
export function callbackTargetOf(authorizationUrl: string): OauthCallbackTarget | null {
    try {
        const url = new URL(authorizationUrl)
        const redirect = url.searchParams.get("redirect_uri")
        if (!redirect) return null
        const target = new URL(redirect)
        if (target.protocol !== "http:" || !LOOPBACK_HOSTS.has(target.hostname)) return null
        const port = Number(target.port || 80)
        if (!Number.isInteger(port) || port < 1 || port > 65535) return null
        return { redirectUri: `${target.origin}${target.pathname}`, port, path: target.pathname, state: url.searchParams.get("state") }
    } catch {
        return null
    }
}

export type ForwardCheck = { ok: true; url: string } | { ok: false; message: string }

/**
 * Confere a URL colada pelo dono e monta a URL que vai ao loopback do host (só `code`, `state`, `iss`,
 * `error` e `error_description`).
 */
export function forwardableCallback(pasted: string, target: OauthCallbackTarget): ForwardCheck {
    let url: URL
    try {
        url = new URL(pasted.trim())
    } catch {
        return { ok: false, message: "Cole a URL inteira da barra de endereço (começa com http://127.0.0.1…)." }
    }
    if (url.protocol !== "http:" || !LOOPBACK_HOSTS.has(url.hostname)) return { ok: false, message: "A URL não é o retorno do OpenCode (deveria começar com http://127.0.0.1)." }
    if (Number(url.port || 80) !== target.port || url.pathname !== target.path) return { ok: false, message: "A URL é de outra tentativa de login: use a da última página aberta." }
    const state = url.searchParams.get("state")
    if (target.state && state !== target.state) return { ok: false, message: "A URL é de outra tentativa de login (state diferente): comece de novo." }
    if (!url.searchParams.get("code") && !url.searchParams.get("error")) return { ok: false, message: "A URL não traz o código de autorização: conclua o login no provedor e cole a URL da página que não abriu." }
    const out = new URL(`http://127.0.0.1:${target.port}${target.path}`)
    for (const key of ["code", "state", "iss", "error", "error_description"]) {
        const value = url.searchParams.get(key)
        if (value !== null) out.searchParams.set(key, value)
    }
    return { ok: true, url: out.toString() }
}

export interface McpOauthConnection {
    id: string
    label: string
    status: string | null
}

/** Situação da autorização a partir da situação do `mcp.list` e das credenciais OAuth da integração. */
export function authorizationStateOf(status: { status: string; error?: string } | null | undefined, connections: readonly McpOauthConnection[]): { state: "not_required" | "needs_auth" | "authorized" | "error" | "unknown"; error: string | null } {
    const error = status?.error ?? null
    if (status?.status === "needs_auth") return { state: "needs_auth", error }
    if (status?.status === "failed") return { state: "error", error }
    if (connections.some((item) => item.status === "needs_auth")) return { state: "needs_auth", error: null }
    if (connections.length) return { state: "authorized", error: null }
    if (status?.status === "connected") return { state: "not_required", error: null }
    return { state: "unknown", error }
}
