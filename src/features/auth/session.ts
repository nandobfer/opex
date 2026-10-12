/**
 * Sessão de login do Opex — cookie assinado, sem estado no servidor.
 *
 * Há **dois tipos de sessão**, discriminados por `kind`:
 * - `admin`: o **dono** do Opex (credenciais `ADMIN_*` do `.env`) — acessa o app completo e pode
 *   pré-visualizar o portal do cliente;
 * - `client`: um **usuário de cliente** (`userId`) — acessa só o portal, no cliente selecionado
 *   (`clientId`, opcional enquanto ele não escolheu).
 *
 * O cookie carrega `payload.assinatura` (HMAC-SHA256). O payload é **mínimo** (`iat`/`exp`/`kind` e
 * os ids): papéis finos (admin do cliente, visibilidade de R$) são conferidos no servidor Node, com
 * acesso ao banco, em cada requisição.
 *
 * Implementado com a **Web Crypto** (`crypto.subtle`), que roda tanto no runtime Edge do
 * `middleware` quanto no runtime Node das rotas: é o mesmo código nos dois lados. Módulo
 * **edge-safe** (nenhum import de `node:crypto`).
 *
 * O segredo (`AUTH_SECRET`) é obrigatório e fail-closed: sem ele, nada é assinado nem aceito.
 */

export const SESSION_COOKIE_NAME = "opex_session"

/**
 * Teto de validade embutido no token (rede de segurança). O cookie em si é **de sessão** (sem
 * `maxAge`) e some ao fechar o navegador; este teto limita um cookie eventualmente exfiltrado.
 */
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export type SessionKind = "admin" | "client"

export interface SessionPayload {
    /** Emitido em (epoch em segundos). */
    iat: number
    /** Expira em (epoch em segundos). */
    exp: number
    /** Tipo de sessão. Cookie antigo (sem `kind`) é recusado, exigindo novo login. */
    kind: SessionKind
    /** Usuário de cliente (`kind: "client"`). */
    userId?: string
    /** Cliente selecionado (`kind: "client"`), enquanto não escolhido fica ausente. */
    clientId?: string
}

export interface SessionInput {
    kind: SessionKind
    userId?: string
    clientId?: string
}

function base64UrlEncode(bytes: Uint8Array): string {
    let binary = ""
    for (const byte of bytes) binary += String.fromCharCode(byte)
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4)
    const binary = atob(padded)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
}

async function importKey(secret: string): Promise<CryptoKey> {
    return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"])
}

/** Assina um novo token de sessão válido por `maxAgeSeconds` a partir de `now`. */
export async function createSessionToken(
    secret: string,
    session: SessionInput,
    now: number = Date.now(),
    maxAgeSeconds: number = SESSION_MAX_AGE_SECONDS,
): Promise<string> {
    const iat = Math.floor(now / 1000)
    const payload: SessionPayload = { iat, exp: iat + maxAgeSeconds, kind: session.kind }
    if (session.kind === "client") {
        if (session.userId) payload.userId = session.userId
        if (session.clientId) payload.clientId = session.clientId
    }
    const encoded = base64UrlEncode(encoder.encode(JSON.stringify(payload)))
    const signature = await crypto.subtle.sign("HMAC", await importKey(secret), encoder.encode(encoded))
    return `${encoded}.${base64UrlEncode(new Uint8Array(signature))}`
}

/**
 * Verifica assinatura e validade e devolve o payload. Devolve `null` para token ausente, malformado,
 * adulterado, vencido ou de versão antiga (sem `kind`) — nunca lança. A comparação da assinatura é
 * feita pelo próprio `crypto.subtle.verify` (tempo constante).
 */
export async function readSessionToken(
    token: string | undefined | null,
    secret: string,
    now: number = Date.now(),
): Promise<SessionPayload | null> {
    if (!token || !secret) return null
    const [encoded, signature] = token.split(".")
    if (!encoded || !signature) return null
    try {
        const validSignature = await crypto.subtle.verify("HMAC", await importKey(secret), base64UrlDecode(signature), encoder.encode(encoded))
        if (!validSignature) return null
        const payload = JSON.parse(decoder.decode(base64UrlDecode(encoded))) as Partial<SessionPayload>
        if (typeof payload.exp !== "number" || payload.exp * 1000 <= now) return null
        if (payload.kind !== "admin" && payload.kind !== "client") return null
        if (payload.kind === "client" && typeof payload.userId !== "string") return null
        return payload as SessionPayload
    } catch {
        return null
    }
}

/**
 * Atalho booleano sobre `readSessionToken` (sessão válida, de qualquer tipo). Usado pelo middleware,
 * que só decide entre barrar e permitir — os papéis finos são conferidos no servidor Node.
 */
export async function verifySessionToken(token: string | undefined | null, secret: string, now: number = Date.now()): Promise<boolean> {
    return (await readSessionToken(token, secret, now)) !== null
}
