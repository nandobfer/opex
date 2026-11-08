import { AxiosError, type AxiosResponse } from "axios"
import { describe, expect, it, vi } from "vitest"
import { batchScope, collectFailedJobIds, isBatchFatalError, runRetryBatch, summarizeRetryBatch, type FetchJobsPage } from "@/features/engramind/job-retry-batch"

const apiError = (status: number, code?: string, message = "falhou") =>
    new AxiosError(message, "ERR", undefined, undefined, { status, data: { success: false, code, error: message } } as AxiosResponse)

describe("batchScope", () => {
    it("estado vazio ou failed vale; leva o tipo filtrado", () => {
        expect(batchScope(undefined, undefined)).toEqual({ ok: true })
        expect(batchScope("embed", "failed")).toEqual({ ok: true, kind: "embed" })
    })
    it("outros estados bloqueiam com o motivo", () => {
        for (const state of ["done", "running", "queued"]) {
            const scope = batchScope(undefined, state)
            expect(scope.ok).toBe(false)
            if (!scope.ok) expect(scope.reason).toContain(state)
        }
    })
})

describe("collectFailedJobIds", () => {
    it("percorre todas as páginas pelo cursor, só failed, 200 por página e com o tipo", async () => {
        const pages: Record<string, { jobs: { id: number }[]; next_cursor: string | null }> = {
            start: { jobs: [{ id: 1 }, { id: 2 }], next_cursor: "c1" },
            c1: { jobs: [{ id: 3 }, { id: 2 }], next_cursor: "c2" },
            c2: { jobs: [{ id: 4 }], next_cursor: null },
        }
        const fetchPage = vi.fn<FetchJobsPage>(async ({ cursor }) => pages[cursor ?? "start"])
        const result = await collectFailedJobIds(fetchPage, { kind: "embed" })
        expect(result).toEqual({ ids: ["1", "2", "3", "4"], truncated: false })
        expect(fetchPage).toHaveBeenCalledTimes(3)
        expect(fetchPage.mock.calls[0][0]).toEqual({ state: "failed", kind: "embed", limit: 200 })
        expect(fetchPage.mock.calls[1][0]).toEqual({ state: "failed", kind: "embed", limit: 200, cursor: "c1" })
    })

    it("sem tipo não envia kind; para no limite com truncated", async () => {
        let n = 0
        const fetchPage = vi.fn<FetchJobsPage>(async () => ({ jobs: [{ id: ++n }, { id: ++n }], next_cursor: `c${n}` }))
        const result = await collectFailedJobIds(fetchPage, { max: 5 })
        expect(result).toEqual({ ids: ["1", "2", "3", "4", "5"], truncated: true })
        expect(fetchPage.mock.calls[0][0]).not.toHaveProperty("kind")
    })

    it("sinal abortado encerra a coleta sem novas páginas", async () => {
        const controller = new AbortController()
        const fetchPage = vi.fn<FetchJobsPage>(async () => {
            controller.abort()
            return { jobs: [{ id: 1 }], next_cursor: "c1" }
        })
        await collectFailedJobIds(fetchPage, { signal: controller.signal })
        expect(fetchPage).toHaveBeenCalledTimes(1)
    })

    it("cursor repetido encerra a coleta (sem loop infinito)", async () => {
        const fetchPage = vi.fn<FetchJobsPage>(async () => ({ jobs: [{ id: 7 }], next_cursor: "same" }))
        const result = await collectFailedJobIds(fetchPage)
        expect(result).toEqual({ ids: ["7"], truncated: false })
        expect(fetchPage).toHaveBeenCalledTimes(2)
    })
})

describe("isBatchFatalError", () => {
    it("rede, 5xx, conexão e limite interrompem; JOB_NOT_RETRYABLE e 404 são falhas do job", () => {
        expect(isBatchFatalError(new AxiosError("rede"))).toBe(true)
        expect(isBatchFatalError(apiError(502, "ENGRAMIND_HTTP_500"))).toBe(true)
        expect(isBatchFatalError(apiError(503, "ENGRAMIND_UNREACHABLE"))).toBe(true)
        expect(isBatchFatalError(apiError(409, "ENGRAMIND_AUTH_INVALID"))).toBe(true)
        expect(isBatchFatalError(apiError(429, "ENGRAMIND_RATE_LIMITED"))).toBe(true)
        expect(isBatchFatalError(apiError(409, "ENGRAMIND_JOB_NOT_RETRYABLE"))).toBe(false)
    })

    it("sessão do Opex expirada (401/403 sem código) e 429 sem código interrompem", () => {
        expect(isBatchFatalError(apiError(401))).toBe(true)
        expect(isBatchFatalError(apiError(403))).toBe(true)
        expect(isBatchFatalError(apiError(429))).toBe(true)
        expect(isBatchFatalError(apiError(404, "ENGRAMIND_NOT_FOUND"))).toBe(false)
    })
})

describe("runRetryBatch", () => {
    it("sucesso parcial: JOB_NOT_RETRYABLE vira falha individual e o lote segue", async () => {
        const retry = vi.fn(async (id: string) => {
            if (id === "2" || id === "4") throw apiError(409, "ENGRAMIND_JOB_NOT_RETRYABLE", "Só jobs failed voltam para a fila.")
        })
        const progress: number[] = []
        const result = await runRetryBatch(["1", "2", "3", "4", "5"], retry, { onProgress: (done) => progress.push(done) })
        expect(retry).toHaveBeenCalledTimes(5)
        expect(result.succeeded).toBe(3)
        expect(result.failed.map((f) => f.id).sort()).toEqual(["2", "4"])
        expect(result.aborted).toBeNull()
        expect(progress).toEqual([1, 2, 3, 4, 5])
    })

    it("erro fatal interrompe: nenhum id novo é puxado depois", async () => {
        const retry = vi.fn(async (id: string) => {
            if (id === "2") throw apiError(503, "ENGRAMIND_UNREACHABLE", "Engramind fora do ar")
        })
        const result = await runRetryBatch(["1", "2", "3", "4"], retry, { concurrency: 1 })
        expect(retry).toHaveBeenCalledTimes(2)
        expect(result).toMatchObject({ total: 4, succeeded: 1, failed: [], aborted: { message: "Engramind fora do ar" } })
    })

    it("cancelado pelo sinal: para de puxar ids e marca cancelled", async () => {
        const controller = new AbortController()
        const retry = vi.fn(async (id: string) => {
            if (id === "2") controller.abort()
        })
        const result = await runRetryBatch(["1", "2", "3", "4"], retry, { concurrency: 1, signal: controller.signal })
        expect(retry).toHaveBeenCalledTimes(2)
        expect(result).toMatchObject({ succeeded: 2, cancelled: true, aborted: null })
        expect(summarizeRetryBatch(result)).toMatchObject({ tone: "warning", title: "Lote interrompido após 2 de 4" })
    })

    it("respeita a concorrência máxima", async () => {
        let active = 0
        let peak = 0
        const retry = async () => {
            active++
            peak = Math.max(peak, active)
            await new Promise((resolve) => setTimeout(resolve, 1))
            active--
        }
        const result = await runRetryBatch(Array.from({ length: 12 }, (_, i) => String(i)), retry)
        expect(peak).toBe(4)
        expect(result.succeeded).toBe(12)
    })
})

describe("summarizeRetryBatch", () => {
    it("sucesso total", () => {
        expect(summarizeRetryBatch({ total: 12, succeeded: 12, failed: [], aborted: null, cancelled: false })).toEqual({ tone: "success", title: "12 de 12 jobs recolocados na fila" })
    })
    it("parcial agrupa os motivos", () => {
        const summary = summarizeRetryBatch({ total: 37, succeeded: 35, failed: [{ id: "a", message: "Só jobs failed voltam para a fila." }, { id: "b", message: "Só jobs failed voltam para a fila." }], aborted: null, cancelled: false })
        expect(summary).toEqual({ tone: "warning", title: "35 de 37 jobs recolocados na fila", description: "2 falharam: Só jobs failed voltam para a fila. (2)" })
    })
    it("interrompido traz a mensagem da API", () => {
        const summary = summarizeRetryBatch({ total: 37, succeeded: 10, failed: [], aborted: { message: "Engramind fora do ar" }, cancelled: false })
        expect(summary.tone).toBe("error")
        expect(summary.title).toBe("Lote interrompido após 10 de 37")
        expect(summary.description).toContain("Engramind fora do ar")
    })
})
