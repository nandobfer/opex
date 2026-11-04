/** @vitest-environment happy-dom */
import React from "react"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ get: vi.fn(), available: vi.fn(), acquire: vi.fn(), release: vi.fn(), bind: vi.fn(), unbind: vi.fn() }))
vi.mock("@/lib/api", () => ({ api: { get: mocks.get }, unwrapApi: (response: { data: unknown }) => response.data }))
vi.mock("@/lib/pusher/client", () => ({ isPusherClientAvailable: mocks.available, acquireChannel: mocks.acquire, releaseChannel: mocks.release }))
vi.mock("@/features/ai/hooks/useAi", () => ({ AI_QUERY_KEY: "ai" }))

import { useProviderUsage } from "@/features/ai/hooks/useProviderUsage"

beforeEach(() => {
    vi.clearAllMocks()
    mocks.available.mockReturnValue(true)
    mocks.acquire.mockReturnValue({ bind: mocks.bind, unbind: mocks.unbind })
    mocks.get.mockResolvedValue({ data: { success: true, data: { rows: [] } } })
})
afterEach(cleanup)

const setup = () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    return { client, wrapper }
}

describe("useProviderUsage", () => {
    it("consulta o provedor sem duplicar /api e invalida só os eventos daquele provedor", async () => {
        const { client, wrapper } = setup()
        const invalidate = vi.spyOn(client, "invalidateQueries")
        const query = { from: "2026-10-10T00:00:00Z" }
        const { result, unmount } = renderHook(() => useProviderUsage("anthropic", query), { wrapper })
        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        expect(mocks.get).toHaveBeenCalledWith("/ai/providers/anthropic/usage", { params: query })
        expect(mocks.acquire).toHaveBeenCalledWith("private-app")
        const event = mocks.bind.mock.calls.find(([name]) => name === "ai-consumption-updated")![1] as (payload?: { provider?: string }) => void
        const reconnect = mocks.bind.mock.calls.find(([name]) => name === "pusher:subscription_succeeded")![1] as () => void
        act(() => event({ provider: "gemini" }))
        expect(invalidate).not.toHaveBeenCalled()
        act(() => event({ provider: "anthropic" }))
        act(() => event())
        expect(invalidate).toHaveBeenCalledTimes(2)
        act(() => reconnect())
        expect(invalidate).toHaveBeenCalledTimes(3)
        unmount()
        expect(mocks.unbind).toHaveBeenCalledTimes(2)
        expect(mocks.release).toHaveBeenCalledWith("private-app")
        client.clear()
    })

    it("período inválido não consulta; sem Pusher ainda permite consulta manual", async () => {
        mocks.available.mockReturnValue(false)
        const { client, wrapper } = setup()
        const { result, rerender } = renderHook(({ query }) => useProviderUsage("gemini", query), { wrapper, initialProps: { query: null as { from?: string } | null } })
        expect(mocks.get).not.toHaveBeenCalled()
        expect(mocks.acquire).not.toHaveBeenCalled()
        rerender({ query: {} })
        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        await act(async () => { await result.current.refetch() })
        expect(mocks.get).toHaveBeenCalledTimes(2)
        client.clear()
    })
})
