/**
 * Sessão de login do Opex — cookie assinado, sem estado no servidor e **sem usuário**.
 *
 * O app passou a ser publicado na internet e tem uma única senha (`APP_PASSWORD`). Depois de
 * validar a senha, o servidor emite um cookie `httpOnly` com um token `payload.assinatura`
 * (HMAC-SHA256). O payload só carrega `iat`/`exp` — não há usuário, papel nem permissão.
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

interface SessionPayload {
    /** Emitido em (epoch em segundos). */
    iat: number
    /** Expira em (epoch em segundos). */
    exp: number
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
    now: number = Date.now(),
    maxAgeSeconds: number = SESSION_MAX_AGE_SECONDS,
): Promise<string> {
    const iat = Math.floor(now / 1000)
    const payload: SessionPayload = { iat, exp: iat + maxAgeSeconds }
    const encoded = base64UrlEncode(encoder.encode(JSON.stringify(payload)))
    const signature = await crypto.subtle.sign("HMAC", await importKey(secret), encoder.encode(encoded))
    return `${encoded}.${base64UrlEncode(new Uint8Array(signature))}`
}

/**
 * Verifica assinatura e validade. Devolve `false` para token ausente, malformado, adulterado ou
 * vencido — nunca lança. A comparação da assinatura é feita pelo próprio `crypto.subtle.verify`
 * (tempo constante).
 */
export async function verifySessionToken(
    token: string | undefined | null,
    secret: string,
    now: number = Date.now(),
): Promise<boolean> {
    if (!token || !secret) return false
    const [encoded, signature] = token.split(".")
    if (!encoded || !signature) return false
    try {
        const validSignature = await crypto.subtle.verify(
            "HMAC",
            await importKey(secret),
            base64UrlDecode(signature),
            encoder.encode(encoded),
        )
        if (!validSignature) return false
        const payload = JSON.parse(decoder.decode(base64UrlDecode(encoded))) as Partial<SessionPayload>
        if (typeof payload.exp !== "number") return false
        return payload.exp * 1000 > now
    } catch {
        return false
    }
}
