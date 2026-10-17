/** @vitest-environment jsdom */
import React, { type ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ send: vi.fn(), get: vi.fn() }))
vi.mock("@/features/environments/hooks/useEnvironments", () => ({
    useEnvironmentApi: () => ({ key: ["environments", false, ""], get: mocks.get, send: mocks.send }),
}))

import { useEnvironmentLogs } from "@/features/environments/hooks/useEnvironmentLogs"
import { envId, repoId } from "./fixtures"

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>

beforeEach(() => {
    mocks.get.mockResolvedValue([])
    mocks.send.mockResolvedValue(undefined)
    // HTTP em IP da rede: contexto não seguro, sem `crypto.randomUUID`.
    vi.stubGlobal("crypto", { getRandomValues: (bytes: Uint8Array) => bytes.map((_, index) => (index * 37) % 256) })
})
afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
})

describe("espectador dos logs do ambiente em contexto HTTP", () => {
    it("registra o espectador com viewerId UUID, sem estourar", async () => {
        const { result } = renderHook(() => useEnvironmentLogs(repoId, envId, ""), { wrapper })
        await waitFor(() => expect(mocks.send).toHaveBeenCalled())
        expect(result.current.isError).toBe(false)
        const [method, path, body] = mocks.send.mock.calls[0] as [string, string, { viewerId: string; remove: boolean }]
        expect(method).toBe("post")
        expect(path).toBe(`/${repoId}/environments/${envId}/viewer`)
        expect(body.remove).toBe(false)
        expect(body.viewerId).toMatch(UUID_V4)
    })

    it("ao sair, libera o mesmo espectador", async () => {
        const { unmount } = renderHook(() => useEnvironmentLogs(repoId, envId, ""), { wrapper })
        await waitFor(() => expect(mocks.send).toHaveBeenCalled())
        const first = mocks.send.mock.calls[0] as [string, string, { viewerId: string }]
        unmount()
        const release = mocks.send.mock.calls.find((call) => (call[2] as { remove: boolean }).remove)
        expect(release).toBeTruthy()
        expect((release![2] as { viewerId: string }).viewerId).toBe(first[2].viewerId)
    })
})
