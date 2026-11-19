import { createHmac, timingSafeEqual } from "node:crypto"
import { PLUGIN_PREVIEW_COOKIE } from "../constants"
import { parsePreviewList } from "../logic"
import { sessionCookieOptions } from "@/features/auth/server/cookie"

/**
 * Cookie da prévia de plugins (OPE-172): lista dos plugins cuja versão `preview` este navegador vê,
 * assinada com HMAC do `AUTH_SECRET` (sem a assinatura válida, vale a lista vazia: todos veem a
 * `stable`). A prévia é ligada por plugin ("Ligar prévia" na mesa, na tela de Plugins ou no portal).
 */

export const PREVIEW_COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60

function secret(): string | null {
    return process.env.AUTH_SECRET?.trim() || null
}

const sign = (value: string, key: string) => createHmac("sha256", key).update(`plugin-preview:${value}`).digest("base64url")

export function encodePreviewCookie(list: string[]): string | null {
    const key = secret()
    if (!key) return null
    const value = list.join(",")
    return `${value}.${sign(value, key)}`
}

export function decodePreviewCookie(raw: string | null | undefined): string[] {
    const key = secret()
    if (!raw || !key) return []
    const dot = raw.lastIndexOf(".")
    if (dot < 0) return []
    const value = raw.slice(0, dot)
    const signature = Buffer.from(raw.slice(dot + 1))
    const expected = Buffer.from(sign(value, key))
    if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) return []
    return parsePreviewList(value)
}

/** Lista da prévia ligada a partir dos cookies de uma requisição. */
export function previewListFromRequest(req: { cookies: { get(name: string): { value: string } | undefined } }): string[] {
    return decodePreviewCookie(req.cookies.get(PLUGIN_PREVIEW_COOKIE)?.value)
}

/** Atributos do cookie; `secure` pelo protocolo real da requisição (como o cookie de sessão). */
export const previewCookieOptions = (secure: boolean) => ({ ...sessionCookieOptions(secure), maxAge: PREVIEW_COOKIE_MAX_AGE_SECONDS })
