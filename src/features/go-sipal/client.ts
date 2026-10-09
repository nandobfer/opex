import { getIntegrationConfig } from "@/lib/integrations/config"
import { integrationDebug } from "@/lib/integrations/debug"

/**
 * Cliente do Go! Sipal (go.sipal.com.br) — SOMENTE servidor. Fala com as rotas internas da
 * interface web da plataforma (sem contrato formal: conferir em `~/code/sap-painel-lancamento`)
 * usando a URL e o JWT salvos em Integrações › Go! Sipal. Base para Tarefas e timers.
 */

export const GO_SIPAL_TIMEOUT_MS = 30_000

export type GoSipalErrorCode = "NOT_CONFIGURED" | "UNAUTHENTICATED" | "FORBIDDEN" | "REJECTED" | "UNAVAILABLE"

export class GoSipalError extends Error {
    constructor(
        message: string,
        readonly code: GoSipalErrorCode,
        /** HTTP devolvido pela plataforma (0 = sem resposta). */
        readonly status = 0,
        /** Corpo JSON da recusa (ex.: `requiresCommitUrl` ao mover tarefa). */
        readonly body: Record<string, unknown> | null = null,
    ) {
        super(message)
        this.name = "GoSipalError"
    }
}

export const GO_SIPAL_NO_SESSION_MESSAGE = "Go! Sipal sem sessão: entre com o código de e-mail em Integrações › Go! Sipal"
export const GO_SIPAL_EXPIRED_MESSAGE = "Sessão do Go! Sipal expirada ou inválida: entre novamente em Integrações › Go! Sipal"

export interface GoSipalRequestOptions {
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
    body?: unknown
    /** Corpo multipart (ex.: anexos); no lugar de `body`. */
    formData?: FormData
    /** `false` nas rotas de login (sem Bearer). */
    auth?: boolean
    /** Token a usar no lugar do salvo. */
    token?: string
    signal?: AbortSignal
    /** Rótulo no debug (ex.: "enviar código"). */
    label?: string
}

function messageFrom(body: unknown): string | undefined {
    if (body && typeof body === "object") {
        const { error, message } = body as { error?: unknown; message?: unknown }
        if (typeof error === "string" && error.trim()) return error.trim()
        if (typeof message === "string" && message.trim()) return message.trim()
    }
    return undefined
}

/** Chama `{baseUrl}{path}` e devolve o JSON; falhas viram `GoSipalError` com mensagem pt-BR. */
export async function goSipalRequest<T>(path: string, options: GoSipalRequestOptions = {}): Promise<T> {
    const config = await getIntegrationConfig("go_sipal")
    const method = options.method ?? "GET"
    const auth = options.auth ?? true
    const token = options.token ?? config.token
    if (auth && !token) throw new GoSipalError(GO_SIPAL_NO_SESSION_MESSAGE, "NOT_CONFIGURED")

    const url = `${config.baseUrl.replace(/\/+$/, "")}${path}`
    const dbg = integrationDebug("go_sipal")
    const label = options.label ?? path
    const headers: Record<string, string> = { Accept: "application/json" }
    if (options.body !== undefined && !options.formData) headers["Content-Type"] = "application/json"
    if (auth && token) headers.Authorization = `Bearer ${token}`

    // O corpo nunca vai para o debug: carrega e-mail, código de acesso ou dados de tarefas.
    dbg.request(`${label}: ${method} ${url}`)
    const startedAt = Date.now()
    let response: Response
    try {
        const timeout = AbortSignal.timeout(GO_SIPAL_TIMEOUT_MS)
        response = await fetch(url, {
            method,
            headers,
            body: options.formData ?? (options.body === undefined ? undefined : JSON.stringify(options.body)),
            cache: "no-store",
            redirect: "manual",
            signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
        })
    } catch (error) {
        dbg.error(`${label}: sem resposta após ${Date.now() - startedAt} ms`, error)
        const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")
        throw new GoSipalError(timedOut ? "O Go! Sipal não respondeu a tempo" : "Não foi possível conectar ao Go! Sipal", "UNAVAILABLE")
    }
    dbg.response(`${label}: HTTP ${response.status} em ${Date.now() - startedAt} ms`, { status: response.status })

    const body = (await response.json().catch(() => null)) as unknown
    if (response.ok) return body as T

    const detail = messageFrom(body)
    const raw = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null
    if (response.status === 401 && auth) throw new GoSipalError(GO_SIPAL_EXPIRED_MESSAGE, "UNAUTHENTICATED", 401)
    if (response.status === 403) throw new GoSipalError(detail ?? "Acesso negado pelo Go! Sipal", "FORBIDDEN", 403, raw)
    // 5xx e redirecionamentos (ex.: proxy/login) = plataforma indisponível, não recusa.
    if (response.status >= 500 || (response.status >= 300 && response.status < 400)) {
        throw new GoSipalError(detail ?? `O Go! Sipal respondeu HTTP ${response.status}`, "UNAVAILABLE", response.status)
    }
    throw new GoSipalError(detail ?? `O Go! Sipal recusou a requisição (HTTP ${response.status})`, "REJECTED", response.status, raw)
}
