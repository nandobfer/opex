import axios from "axios"
import type { EngramindJob } from "./types"

/**
 * Lote "Retentar todos" do card Jobs (OPE-150), puro: o Engramind só tem retry por job
 * (`POST /v1/jobs/{job}/retry`), então o Opex coleta os `failed` do escopo e retenta um a um.
 */

export const RETRY_BATCH_MAX = 5000
export const RETRY_BATCH_PAGE_SIZE = 200
export const RETRY_BATCH_CONCURRENCY = 4

export type RetryScope = { ok: true; kind?: string } | { ok: false; reason: string }

/** Escopo do lote pelos filtros da tela: só estado vazio ou `failed` têm falhos. */
export function batchScope(kind: string | undefined, state: string | undefined): RetryScope {
    if (state && state !== "failed") return { ok: false, reason: `O filtro de estado está em ${state}: escolha "failed" ou limpe o filtro para retentar os falhos.` }
    return kind ? { ok: true, kind } : { ok: true }
}

export interface JobsPage {
    jobs?: Pick<EngramindJob, "id">[]
    next_cursor?: string | null
}

export type FetchJobsPage = (params: { state: "failed"; kind?: string; limit: number; cursor?: string }) => Promise<JobsPage>

/** Todos os ids `failed` do escopo, página a página, com limite defensivo e trava contra cursor repetido. */
export async function collectFailedJobIds(fetchPage: FetchJobsPage, options: { kind?: string; max?: number; signal?: AbortSignal } = {}): Promise<{ ids: string[]; truncated: boolean }> {
    const max = options.max ?? RETRY_BATCH_MAX
    const ids = new Set<string>()
    const seen = new Set<string>()
    let cursor: string | undefined
    for (;;) {
        if (options.signal?.aborted) return { ids: [...ids], truncated: false }
        const page = await fetchPage({ state: "failed", ...(options.kind ? { kind: options.kind } : {}), limit: RETRY_BATCH_PAGE_SIZE, ...(cursor ? { cursor } : {}) })
        for (const job of page.jobs ?? []) {
            if (ids.size >= max) return { ids: [...ids], truncated: true }
            ids.add(String(job.id))
        }
        const next = page.next_cursor ?? null
        if (!next || seen.has(next)) return { ids: [...ids], truncated: false }
        if (ids.size >= max) return { ids: [...ids], truncated: true }
        seen.add(next)
        cursor = next
    }
}

const FATAL_CODES = new Set([
    "ENGRAMIND_UNREACHABLE",
    "ENGRAMIND_NOT_CONFIGURED",
    "ENGRAMIND_AUTH_INVALID",
    "ENGRAMIND_SCOPE_REQUIRED",
    "ENGRAMIND_TOKEN_INSUFFICIENT",
    "ENGRAMIND_PROXY_MASKED",
    "ENGRAMIND_RATE_LIMITED",
])

/**
 * Erro que interrompe o lote (rede, 5xx, sessão do Opex expirada ou sem acesso — 401/403 —, limite de
 * requisições — 429 —, conexão/token do Engramind); o resto é falha do job.
 */
export function isBatchFatalError(error: unknown): boolean {
    if (!axios.isAxiosError(error)) return true
    if (!error.response) return true
    const { status } = error.response
    if (status >= 500 || status === 401 || status === 403 || status === 429) return true
    const code = (error.response.data as { code?: string } | undefined)?.code
    return Boolean(code && FATAL_CODES.has(code))
}

/** Mensagem pt-BR de um erro do retry (a da API, quando houver). */
export function retryErrorMessage(error: unknown): string {
    if (axios.isAxiosError(error)) {
        const message = (error.response?.data as { error?: string } | undefined)?.error
        if (message) return message
        if (!error.response) return "Sem resposta do Opex."
    }
    return error instanceof Error && error.message ? error.message : "Erro desconhecido."
}

export interface RetryBatchResult {
    total: number
    succeeded: number
    failed: { id: string; message: string }[]
    aborted: { message: string } | null
    /** O lote foi cancelado (ex.: o card saiu da tela) antes de retentar todos os ids. */
    cancelled: boolean
}

export interface RunRetryBatchOptions {
    concurrency?: number
    onProgress?: (done: number, total: number) => void
    isFatal?: (error: unknown) => boolean
    messageOf?: (error: unknown) => string
    /** Cancela o lote: nenhum id novo é puxado (os em andamento terminam). */
    signal?: AbortSignal
}

/** Retenta os ids com concorrência baixa; falha de job segue, erro fatal para de puxar ids novos. */
export async function runRetryBatch(ids: readonly string[], retryOne: (id: string) => Promise<unknown>, options: RunRetryBatchOptions = {}): Promise<RetryBatchResult> {
    const { concurrency = RETRY_BATCH_CONCURRENCY, onProgress, isFatal = isBatchFatalError, messageOf = retryErrorMessage, signal } = options
    const result: RetryBatchResult = { total: ids.length, succeeded: 0, failed: [], aborted: null, cancelled: false }
    let next = 0
    let done = 0
    const worker = async () => {
        while (!result.aborted && next < ids.length) {
            if (signal?.aborted) {
                result.cancelled = true
                return
            }
            const id = ids[next++]
            try {
                await retryOne(id)
                result.succeeded++
            } catch (error) {
                if (isFatal(error)) {
                    result.aborted ??= { message: messageOf(error) }
                    continue
                }
                result.failed.push({ id, message: messageOf(error) })
            }
            done++
            onProgress?.(done, ids.length)
        }
    }
    await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, ids.length)) }, worker))
    return result
}

export interface RetryBatchSummary {
    tone: "success" | "warning" | "error"
    title: string
    description?: string
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/** Resumo do lote para o toast: sucesso total, parcial (motivos agrupados) ou interrompido. */
export function summarizeRetryBatch(result: RetryBatchResult): RetryBatchSummary {
    const reasons = new Map<string, number>()
    for (const failure of result.failed) reasons.set(failure.message, (reasons.get(failure.message) ?? 0) + 1)
    const grouped = [...reasons.entries()].sort((a, b) => b[1] - a[1])
    const reasonText = grouped.slice(0, 3).map(([message, count]) => `${message} (${count})`).join("; ") + (grouped.length > 3 ? "; …" : "")
    const recolocados = `${result.succeeded} de ${plural(result.total, "job recolocado", "jobs recolocados")} na fila`
    if (result.aborted) {
        return { tone: "error", title: `Lote interrompido após ${result.succeeded + result.failed.length} de ${result.total}`, description: [result.aborted.message, result.succeeded ? `${recolocados}.` : null].filter(Boolean).join(" ") }
    }
    if (result.cancelled) {
        return { tone: "warning", title: `Lote interrompido após ${result.succeeded + result.failed.length} de ${result.total}`, description: `O card Jobs saiu da tela. ${recolocados}.` }
    }
    if (result.failed.length === 0) return { tone: "success", title: recolocados }
    return { tone: result.succeeded ? "warning" : "error", title: recolocados, description: `${plural(result.failed.length, "falhou", "falharam")}: ${reasonText}` }
}
