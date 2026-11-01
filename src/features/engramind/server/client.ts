import { randomUUID } from "node:crypto"
import { getIntegrationConfig } from "@/lib/integrations/config"
import { debugFetch, integrationDebug } from "@/lib/integrations/debug"
import { ENGRAMIND_INTEGRATION_ID } from "../constants"
import type { EngramindMethod, EngramindRequest } from "../operations"
import { notConfiguredError, proxyMaskedError, toEngramindError, unreachableError, type EngramindErrorBody } from "./errors"

/**
 * Cliente HTTP do Engramind — SOMENTE servidor. Bearer com o token privado da integração,
 * `User-Agent` do Opex, `Idempotency-Key` em toda mutação, debug mascarado (`debugFetch`) e erros
 * traduzidos para `DomainError`. O navegador nunca chama o Engramind (CORS fechado).
 */

const TIMEOUT_MS = 30_000
const USER_AGENT = `opex/${process.env.npm_package_version ?? "app"}`

export interface EngramindTarget {
    baseUrl: string
    token: string
}

export interface EngramindCallOptions {
    /** Base e token explícitos (bootstrap e teste); padrão: os da integração. */
    target?: EngramindTarget
    /** Chave de idempotência fixa (importação); padrão: uma nova por chamada de mutação. */
    idempotencyKey?: string
    signal?: AbortSignal
    timeoutMs?: number
    /** O corpo leva segredo: vai como bytes, que o debug não registra (só método, URL e cabeçalhos mascarados). */
    sensitiveBody?: boolean
    /** Cabeçalhos extras (ex.: `If-None-Match` do contexto); `304` devolve `null`. */
    headers?: Record<string, string>
}

export async function engramindTarget(): Promise<EngramindTarget> {
    const config = await getIntegrationConfig(ENGRAMIND_INTEGRATION_ID)
    if (!config.baseUrl || !config.adminToken) throw notConfiguredError()
    return { baseUrl: config.baseUrl.replace(/\/+$/, ""), token: config.adminToken }
}

export function buildUrl(baseUrl: string, request: Pick<EngramindRequest, "path" | "query">): string {
    const url = new URL(`${baseUrl}${request.path}`)
    for (const [key, value] of Object.entries(request.query ?? {})) if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value))
    return url.toString()
}

function encodeBody(body: unknown, sensitive: boolean): string | Blob {
    const json = JSON.stringify(body)
    return sensitive ? new Blob([json], { type: "application/json" }) : json
}

const debug = () => integrationDebug(ENGRAMIND_INTEGRATION_ID)

/** Chama o Engramind e devolve o JSON (204/corpo vazio → `null`). */
export async function engramindCall<T = unknown>(method: EngramindMethod, request: EngramindRequest, options: EngramindCallOptions = {}): Promise<T> {
    const target = options.target ?? (await engramindTarget())
    const headers: Record<string, string> = { ...options.headers, Authorization: `Bearer ${target.token}`, Accept: "application/json", "User-Agent": USER_AGENT }
    if (method !== "GET") headers["Idempotency-Key"] = options.idempotencyKey ?? `opex-${randomUUID()}`
    const hasBody = request.body !== undefined && method !== "GET"
    if (hasBody) headers["Content-Type"] = "application/json"
    const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS)]) : AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS)
    let res: Response
    try {
        res = await debugFetch(debug(), "Engramind", buildUrl(target.baseUrl, request), { method, headers, body: hasBody ? encodeBody(request.body, options.sensitiveBody === true) : undefined, cache: "no-store", signal })
    } catch (error) {
        const reason = error instanceof Error ? (error.name === "TimeoutError" || error.name === "AbortError" ? "tempo limite" : ((error as { cause?: { code?: string } }).cause?.code ?? error.message)) : String(error)
        throw unreachableError(reason)
    }
    if (res.status === 304) return null as T
    const text = await res.text()
    let json: unknown = null
    if (text) {
        try {
            json = JSON.parse(text)
        } catch {
            json = null
        }
    }
    if (!res.ok) {
        const body = (json as { error?: EngramindErrorBody } | null)?.error ?? null
        throw toEngramindError(res.status, body, res.headers.get("retry-after"), body ? null : proxyMaskedError(text, json))
    }
    return json as T
}

/** `GET /health/ready` (público): `true` quando o serviço recebe tráfego. */
export async function engramindReady(baseUrl: string, signal?: AbortSignal): Promise<{ ready: boolean; detail: string }> {
    try {
        const res = await debugFetch(debug(), "Engramind", `${baseUrl.replace(/\/+$/, "")}/health/ready`, { headers: { Accept: "application/json", "User-Agent": USER_AGENT }, cache: "no-store", signal: signal ?? AbortSignal.timeout(10_000) })
        const body = (await res.json().catch(() => null)) as { status?: string } | null
        return { ready: res.ok && body?.status === "ready", detail: body?.status ?? `HTTP ${res.status}` }
    } catch (error) {
        return { ready: false, detail: error instanceof Error ? error.message : String(error) }
    }
}
