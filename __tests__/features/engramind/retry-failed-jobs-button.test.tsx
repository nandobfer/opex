/** @vitest-environment happy-dom */
import React from "react"
import { AxiosError, type AxiosResponse } from "axios"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() } }))
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: { get: mocks.get, post: mocks.post, delete: vi.fn() } }))
vi.mock("@/lib/pusher/client", () => ({ isPusherClientAvailable: () => false, acquireChannel: vi.fn(), releaseChannel: vi.fn() }))
vi.mock("sonner", () => ({ toast: mocks.toast }))
vi.mock("framer-motion", async () => (await import("../../helpers/framer-motion")).framerMotionMock())

import { useRetryFailedJobs } from "@/features/engramind/hooks/useRetryFailedJobs"
import { RetryFailedJobsButton } from "@/features/engramind/components/integration/operation/RetryFailedJobsButton"

const ok = (data: unknown) => ({ data: { success: true, data } })
const notRetryable = () =>
    new AxiosError("409", "ERR", undefined, undefined, { status: 409, data: { success: false, code: "ENGRAMIND_JOB_NOT_RETRYABLE", error: "Só jobs failed voltam para a fila." } } as AxiosResponse)

function Harness({ kind, state }: { kind?: string; state?: string }) {
    const batch = useRetryFailedJobs({ kind, state })
    return <RetryFailedJobsButton batch={batch} />
}

const renderButton = (props: { kind?: string; state?: string } = {}) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
    render(
        <QueryClientProvider client={client}>
            <Harness {...props} />
        </QueryClientProvider>,
    )
    return client
}

const failedJobs = (ids: number[]) => ids.map((id) => ({ id, kind: "embed", state: "failed", attempts: 3 }))

beforeEach(() => {
    vi.clearAllMocks()
    mocks.get.mockImplementation(async (_url: string, { params }: { params: Record<string, unknown> }) => {
        if (params.limit === 1) return ok({ jobs: failedJobs([1]), next_cursor: "x" })
        if (!params.cursor) return ok({ jobs: failedJobs([1, 2]), next_cursor: "c1" })
        return ok({ jobs: failedJobs([3]), next_cursor: null })
    })
    mocks.post.mockResolvedValue(ok({ ok: true }))
})
afterEach(cleanup)

const button = () => screen.getByRole("button", { name: /Retentar todos|Contando|Retentando/ })

describe("RetryFailedJobsButton", () => {
    it("sem jobs failed no escopo fica bloqueado com o motivo", async () => {
        mocks.get.mockResolvedValue(ok({ jobs: [], next_cursor: null }))
        renderButton()
        await waitFor(() => expect(button().getAttribute("aria-disabled")).toBe("true"))
        fireEvent.click(button())
        expect(mocks.get).toHaveBeenCalledTimes(1)
        expect(mocks.post).not.toHaveBeenCalled()
    })

    it("filtro de estado done bloqueia sem consultar", () => {
        renderButton({ state: "done" })
        expect(button().getAttribute("aria-disabled")).toBe("true")
        expect(mocks.get).not.toHaveBeenCalled()
    })

    it("coleta todas as páginas, confirma com a contagem e retenta cada id uma vez só", async () => {
        renderButton({ kind: "embed" })
        await waitFor(() => expect(button().hasAttribute("aria-disabled")).toBe(false))
        fireEvent.click(button())
        await screen.findByText("Recolocar 3 jobs falhos na fila?")
        expect(mocks.get).toHaveBeenCalledWith("/engramind/jobs", { params: { state: "failed", kind: "embed", limit: 200 } })
        const confirm = screen.getAllByRole("button", { name: "Retentar todos" }).at(-1)!
        fireEvent.click(confirm)
        fireEvent.click(confirm)
        await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith("3 de 3 jobs recolocados na fila", undefined))
        expect(mocks.post).toHaveBeenCalledTimes(3)
        expect(mocks.post.mock.calls.map(([url]) => url).sort()).toEqual(["/engramind/jobs/1/retry", "/engramind/jobs/2/retry", "/engramind/jobs/3/retry"])
    })

    it("resumo parcial quando um job não pode mais ser retentado", async () => {
        mocks.post.mockImplementation(async (url: string) => {
            if (url.includes("/2/")) throw notRetryable()
            return ok({ ok: true })
        })
        renderButton()
        await waitFor(() => expect(button().hasAttribute("aria-disabled")).toBe(false))
        fireEvent.click(button())
        await screen.findByText("Recolocar 3 jobs falhos na fila?")
        fireEvent.click(screen.getAllByRole("button", { name: "Retentar todos" }).at(-1)!)
        await waitFor(() =>
            expect(mocks.toast.warning).toHaveBeenCalledWith("2 de 3 jobs recolocados na fila", { description: "1 falhou: Só jobs failed voltam para a fila. (1)" }),
        )
    })
})
