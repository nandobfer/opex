/** @vitest-environment happy-dom */
import React from "react"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ get: vi.fn(), available: vi.fn(), acquire: vi.fn(), release: vi.fn(), bind: vi.fn(), unbind: vi.fn() }))
vi.mock("@/lib/api", () => ({ api: { get: mocks.get }, unwrapApi: (response: { data: unknown }) => response.data }))
vi.mock("@/lib/pusher/client", () => ({ isPusherClientAvailable: mocks.available, acquireChannel: mocks.acquire, releaseChannel: mocks.release }))
vi.mock("@/features/ai/hooks/useAi", () => ({ AI_QUERY_KEY: "ai" }))

import { useJevUsage } from "@/features/ai/hooks/useJevUsage"

beforeEach(() => {
    vi.clearAllMocks()
    mocks.available.mockReturnValue(true)
    mocks.acquire.mockReturnValue({ bind: mocks.bind, unbind: mocks.unbind })
    mocks.get.mockResolvedValue({ data: { success: true, data: { requests: 1, totalTokens: 120 } } })
})
afterEach(cleanup)
const setup = () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    return { client, wrapper }
}

describe("useJevUsage", () => {
    it("consulta pelo axios sem duplicar /api e invalida por evento e reconexão", async () => {
        const { client, wrapper } = setup()
        const invalidate = vi.spyOn(client, "invalidateQueries")
        const query = { from: "2026-10-10T00:00:00Z" }
        const { result, unmount } = renderHook(() => useJevUsage(query), { wrapper })
        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        expect(mocks.get).toHaveBeenCalledWith("/ai/providers/jev/usage", { params: query })
        expect(mocks.acquire).toHaveBeenCalledWith("private-app")
        for (const event of ["jev-usage-updated", "pusher:subscription_succeeded"]) {
            const handler = mocks.bind.mock.calls.find(([name]) => name === event)![1] as () => void
            act(() => handler())
        }
        expect(invalidate).toHaveBeenCalledTimes(2)
        unmount()
        expect(mocks.unbind).toHaveBeenCalledTimes(2)
        expect(mocks.release).toHaveBeenCalledWith("private-app")
        client.clear()
    })

    it("período inválido não consulta; sem Pusher ainda permite consulta manual", async () => {
        mocks.available.mockReturnValue(false)
        const { client, wrapper } = setup()
        const { result, rerender } = renderHook(({ query }) => useJevUsage(query), { wrapper, initialProps: { query: null as { from?: string } | null } })
        expect(mocks.get).not.toHaveBeenCalled()
        expect(mocks.acquire).not.toHaveBeenCalled()
        rerender({ query: {} })
        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        await act(async () => { await result.current.refetch() })
        expect(mocks.get).toHaveBeenCalledTimes(2)
        client.clear()
    })
})
