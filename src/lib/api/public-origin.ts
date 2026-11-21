/**
 * Origem pública (`protocolo://host[:porta]`) com que o navegador chegou ao Opex — nunca o endereço
 * interno em que o processo escuta (container, `0.0.0.0:3100`). Usada em todo redirecionamento
 * absoluto montado pelo app (ex.: retorno do OAuth dos MCPs). Ordem: cabeçalho `Origin` enviado pelo
 * navegador, `X-Forwarded-Host`/`X-Forwarded-Proto` do proxy, `Host` e, por último, a URL da requisição.
 */

const ORIGIN_PATTERN = /^https?:\/\/[^\s/]+$/i
const HOST_PATTERN = /^[a-z0-9.-]+(:\d{1,5})?$|^\[[0-9a-f:]+\](:\d{1,5})?$/i

const first = (value: string | null) => value?.split(",")[0]?.trim() || null

export function publicOriginOf(headers: Pick<Headers, "get">, requestUrl: string): string {
    const origin = first(headers.get("origin"))
    if (origin && origin !== "null" && ORIGIN_PATTERN.test(origin)) return origin.replace(/\/+$/, "")
    const fallback = new URL(requestUrl)
    const forwardedProto = first(headers.get("x-forwarded-proto"))
    const proto = forwardedProto === "https" || forwardedProto === "http" ? forwardedProto : fallback.protocol.replace(":", "")
    const host = first(headers.get("x-forwarded-host")) ?? first(headers.get("host"))
    if (host && HOST_PATTERN.test(host)) return `${proto}://${host}`
    return fallback.origin
}
