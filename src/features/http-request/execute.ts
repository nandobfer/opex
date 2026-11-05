import { loggerFor } from "@/lib/logger"
import { MAX_HTTP_REDIRECTS, type HttpBody, type HttpRequestInput, type HttpRequestOutput, type HttpSecretVault } from "./schemas"
import { collectSecretNames, hostAllowed, maskSecrets, maskSecretText, substituteSecrets } from "./secrets"

/**
 * Execução da "Chamada HTTP" (OPE-130, D6/D7). Sem bloqueio de rede (D7): qualquer endereço, inclusive
 * a rede interna. Os segredos (`{{secret:NOME}}`, só nos rotineiros) entram só aqui, no envio, e são
 * mascarados em tudo o que volta. O domínio permitido de cada segredo é conferido também a cada
 * redirecionamento: um salto para fora não é seguido. Em redirecionamento para outra origem,
 * `Authorization` e `Cookie` saem (como no navegador). A resposta é lida em stream até o limite.
 *
 * Log só com método, host, status, duração e bytes (sem URL completa, cabeçalhos nem corpo).
 */

const log = loggerFor({ module: "http-request" })

export class HttpRequestError extends Error {
    constructor(message: string) {
        super(message)
        this.name = "HttpRequestError"
    }
}

export interface ExecuteHttpOptions {
    secrets?: HttpSecretVault
    signal?: AbortSignal
    fetchImpl?: typeof fetch
}

const NO_SECRETS_MESSAGE = "Segredos ({{secret:NOME}}) só existem nos agentes rotineiros (aba Segredos da página do agente)"
const TEXT_TYPES = /^(text\/|application\/(json|xml|javascript|x-www-form-urlencoded|ld\+json|problem\+json|[a-z.+-]*\+(json|xml)))/i

function buildBody(body: HttpBody | undefined, values: ReadonlyMap<string, string>): { body?: BodyInit; contentType?: string } {
    if (!body) return {}
    switch (body.type) {
        case "json":
            return { body: JSON.stringify(substituteSecrets(body.value, values)), contentType: "application/json" }
        case "text":
            return { body: substituteSecrets(body.value, values), contentType: body.contentType ?? "text/plain; charset=utf-8" }
        case "form":
            return { body: new URLSearchParams(substituteSecrets(body.fields, values)).toString(), contentType: "application/x-www-form-urlencoded" }
        case "multipart": {
            const form = new FormData()
            for (const [key, value] of Object.entries(substituteSecrets(body.fields ?? {}, values))) form.append(key, value)
            for (const file of body.files ?? []) form.append(file.field, new Blob([Buffer.from(file.base64, "base64")], { type: file.contentType ?? "application/octet-stream" }), file.filename)
            // O `fetch` define o Content-Type com o boundary.
            return { body: form }
        }
        case "base64":
            return { body: new Uint8Array(Buffer.from(substituteSecrets(body.value, values), "base64")), contentType: body.contentType ?? "application/octet-stream" }
    }
}

async function readLimited(response: Response, max: number): Promise<{ bytes: Uint8Array; truncated: boolean }> {
    if (!response.body) return { bytes: new Uint8Array(), truncated: false }
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    let truncated = false
    while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (size + value.byteLength > max) {
            chunks.push(value.subarray(0, max - size))
            size = max
            truncated = true
            await reader.cancel().catch(() => undefined)
            break
        }
        chunks.push(value)
        size += value.byteLength
    }
    return { bytes: Buffer.concat(chunks), truncated }
}

function decodeBody(bytes: Uint8Array, contentType: string | null, type: HttpRequestInput["responseType"]): { bodyType: HttpRequestOutput["bodyType"]; body: unknown } {
    if (type === "none") return { bodyType: "none", body: null }
    const buffer = Buffer.from(bytes)
    if (type === "base64") return { bodyType: "base64", body: buffer.toString("base64") }
    const text = buffer.toString("utf8")
    if (type === "json" || (type === "auto" && contentType && /json/i.test(contentType))) {
        try {
            return { bodyType: "json", body: text.trim() ? JSON.parse(text) : null }
        } catch {
            return { bodyType: "text", body: text }
        }
    }
    if (type === "text" || (contentType && TEXT_TYPES.test(contentType)) || (!contentType && !text.includes("\uFFFD"))) return { bodyType: "text", body: text }
    if (!text.includes("\uFFFD") && !/[\u0000-\u0008\u000E-\u001F]/.test(text)) return { bodyType: "text", body: text }
    return { bodyType: "base64", body: buffer.toString("base64") }
}

function describeFailure(error: unknown, host: string, timeoutSeconds: number, aborted: boolean): string {
    if (aborted) return "A requisição foi cancelada"
    const err = error as { name?: string; message?: string; cause?: { code?: string; message?: string } }
    if (err?.name === "TimeoutError") return `A requisição passou de ${timeoutSeconds} s`
    const code = err?.cause?.code ?? ""
    if (code === "ENOTFOUND" || code === "EAI_AGAIN") return `Não foi possível resolver o endereço ${host}`
    if (code === "ECONNREFUSED") return `Conexão recusada por ${host}`
    if (code === "ECONNRESET") return `A conexão com ${host} foi encerrada no meio da requisição`
    if (/CERT|SSL|TLS/i.test(code) || /certificate|ssl|tls/i.test(err?.cause?.message ?? "")) return `Falha de TLS/certificado em ${host}: ${err?.cause?.message ?? code}`
    return `Falha na requisição a ${host}: ${err?.cause?.message ?? err?.message ?? "erro desconhecido"}`
}

export async function executeHttpRequest(input: HttpRequestInput, options: ExecuteHttpOptions = {}): Promise<HttpRequestOutput & { warning?: string }> {
    const fetcher = options.fetchImpl ?? fetch
    const vault = options.secrets
    const used = collectSecretNames([input.url, input.query, input.headers, input.body])
    const catalog = vault?.list() ?? []
    if (used.size && !vault) throw new HttpRequestError(NO_SECRETS_MESSAGE)
    const values = new Map<string, string>()
    for (const name of used) {
        const value = vault!.value(name)
        if (value === undefined) throw new HttpRequestError(`O segredo ${name} não existe neste agente. Disponíveis: ${catalog.map((item) => item.name).join(", ") || "nenhum"}`)
        values.set(name, value)
    }
    const allSecrets = catalog.flatMap((item) => {
        const value = vault!.value(item.name)
        return value === undefined ? [] : [{ name: item.name, value }]
    })
    const mask = <T>(value: T) => maskSecrets(value, allSecrets)
    const rules = catalog.filter((item) => used.has(item.name) && item.allowedHosts.length)
    const blockedBy = (host: string) => rules.find((item) => !hostAllowed(host, item.allowedHosts))

    let url: URL
    try {
        url = new URL(substituteSecrets(input.url, values))
    } catch {
        throw new HttpRequestError("URL inválida")
    }
    for (const [key, value] of Object.entries(substituteSecrets(input.query ?? {}, values))) url.searchParams.append(key, value)
    const firstBlock = blockedBy(url.host)
    if (firstBlock) throw new HttpRequestError(`O segredo ${firstBlock.name} só pode ser usado em ${firstBlock.allowedHosts.join(", ")}`)
    if (input.body && (input.method === "GET" || input.method === "HEAD")) throw new HttpRequestError(`Requisições ${input.method} não aceitam corpo`)

    const built = buildBody(input.body, values)
    const headers = new Headers()
    for (const [key, value] of Object.entries(substituteSecrets(input.headers ?? {}, values))) {
        try {
            headers.set(key, value)
        } catch {
            throw new HttpRequestError(mask(`Cabeçalho inválido: ${key}`))
        }
    }
    if (input.body?.type === "multipart") headers.delete("content-type")
    else if (built.contentType && !headers.has("content-type")) headers.set("content-type", built.contentType)

    const timeout = AbortSignal.timeout(input.timeoutSeconds * 1000)
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout
    const startedAt = Date.now()
    let method: string = input.method
    let body = built.body
    let redirected = false
    let warning: string | undefined
    let response: Response
    try {
        for (let hop = 0; ; hop++) {
            response = await fetcher(url, { method, headers, body, redirect: "manual", signal })
            const location = response.headers.get("location")
            if (!input.followRedirects || response.status < 300 || response.status >= 400 || !location || hop >= MAX_HTTP_REDIRECTS) {
                if (input.followRedirects && hop >= MAX_HTTP_REDIRECTS && location && response.status >= 300 && response.status < 400) warning = `Parou após ${MAX_HTTP_REDIRECTS} redirecionamentos`
                break
            }
            const next = new URL(location, url)
            const blocked = blockedBy(next.host)
            if (blocked) {
                warning = `Redirecionamento para ${next.host} não seguido: o segredo ${blocked.name} só pode ser usado em ${blocked.allowedHosts.join(", ")}`
                break
            }
            await response.body?.cancel().catch(() => undefined)
            if (next.origin !== url.origin) {
                headers.delete("authorization")
                headers.delete("cookie")
            }
            if (response.status === 303 || ((response.status === 301 || response.status === 302) && method === "POST")) {
                method = "GET"
                body = undefined
                headers.delete("content-type")
            }
            url = next
            redirected = true
        }
    } catch (error) {
        const message = mask(describeFailure(error, url.host, input.timeoutSeconds, options.signal?.aborted === true))
        log.warn({ method, host: url.host, durationMs: Date.now() - startedAt, err: message }, "[http-request] falha")
        throw new HttpRequestError(message)
    } finally {
        if (used.size) vault?.markUsed([...used])
    }
    const contentType = response!.headers.get("content-type")
    let read: { bytes: Uint8Array; truncated: boolean }
    try {
        read = input.method === "HEAD" ? { bytes: new Uint8Array(), truncated: false } : await readLimited(response!, input.maxResponseBytes)
    } catch (error) {
        throw new HttpRequestError(mask(describeFailure(error, url.host, input.timeoutSeconds, options.signal?.aborted === true)))
    }
    const responseHeaders: Record<string, string | string[]> = {}
    response!.headers.forEach((value, key) => {
        if (key !== "set-cookie") responseHeaders[key] = value
    })
    const cookies = response!.headers.getSetCookie?.() ?? []
    if (cookies.length) responseHeaders["set-cookie"] = cookies
    const decoded = decodeBody(read.bytes, contentType, input.responseType)
    const durationMs = Date.now() - startedAt
    log.info({ method, host: url.host, status: response!.status, durationMs, bytes: read.bytes.byteLength }, "[http-request] chamada")
    return mask({
        ok: response!.ok,
        status: response!.status,
        statusText: response!.statusText,
        url: url.toString(),
        redirected,
        headers: responseHeaders,
        contentType,
        bodyType: decoded.bodyType,
        body: decoded.body,
        bytes: read.bytes.byteLength,
        truncated: read.truncated,
        durationMs,
        ...(warning ? { warning } : {}),
    })
}

/** Mascara uma mensagem com os segredos do cofre (para erros fora de `executeHttpRequest`). */
export function maskWithVault(text: string, vault: HttpSecretVault | undefined): string {
    if (!vault) return text
    return maskSecretText(
        text,
        vault.list().flatMap((item) => {
            const value = vault.value(item.name)
            return value === undefined ? [] : [{ name: item.name, value }]
        }),
    )
}
