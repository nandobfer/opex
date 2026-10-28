/** @vitest-environment happy-dom */

import React from "react"
import { act, renderHook } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { IntegrationListItemDto } from "@/features/integrations/types"

const mocks = vi.hoisted(() => ({
    available: true,
    handlers: new Map<string, (payload: unknown) => void>(),
    acquire: vi.fn(),
    release: vi.fn(),
}))

vi.mock("@/lib/pusher/client", () => ({
    isPusherClientAvailable: () => mocks.available,
    acquireChannel: (name: string) => {
        mocks.acquire(name)
        return {
            bind: (event: string, handler: (payload: unknown) => void) => mocks.handlers.set(`${name}:${event}`, handler),
            unbind: vi.fn(),
        }
    },
    releaseChannel: mocks.release,
}))

import {
    applyIntegrationHealth,
    integrationsListKey,
    statusPollInterval,
    STATUS_POLL_FALLBACK_MS,
    STATUS_POLL_REALTIME_MS,
} from "@/features/integrations/hooks/useIntegrations"
import { useIntegrationStatusLive } from "@/features/integrations/hooks/useIntegrationStatusLive"
import { useIntegrationTestStream } from "@/features/integrations/hooks/useIntegrationTestStream"

const item = (id: IntegrationListItemDto["id"], health: IntegrationListItemDto["health"]): IntegrationListItemDto => ({
    id,
    name: id,
    description: "",
    environment: "interno",
    debugMode: false,
    health,
})

function setup() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(integrationsListKey, [
        item("crons", { status: "error", checkedAt: "2026-09-22T10:00:00.000Z" }),
        item("pusher", { status: "ok" }),
    ])
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    const health = (id: string) => client.getQueryData<IntegrationListItemDto[]>(integrationsListKey)!.find((i) => i.id === id)!.health
    return { client, wrapper, health }
}

beforeEach(() => {
    vi.clearAllMocks()
    mocks.available = true
    mocks.handlers.clear()
})

describe("status das integrações no cliente (issue #604)", () => {
    it("regressão: o resultado do teste manual atualiza a tabela sem nova requisição", async () => {
        const { wrapper, health } = setup()
        const body = [
            JSON.stringify({ type: "log", level: "info", message: "x", ts: "2026-09-22T12:00:00.000Z" }),
            JSON.stringify({ type: "result", ok: true, latencyMs: 42, message: "Crons ok", ts: "2026-09-22T12:00:01.000Z" }),
            "",
        ].join("\n")
        const fetchMock = vi.fn(async () => new Response(body, { status: 200 }))
        vi.stubGlobal("fetch", fetchMock)

        const { result } = renderHook(() => useIntegrationTestStream("crons", vi.fn()), { wrapper })
        await act(async () => {
            await result.current.start()
        })

        expect(health("crons")).toMatchObject({ status: "ok", latencyMs: 42, checking: false, checkedAt: "2026-09-22T12:00:01.000Z" })
        expect(fetchMock).toHaveBeenCalledTimes(1)
        vi.unstubAllGlobals()
    })

    it("evento do Pusher: início gira a bolinha, fim aplica o status só na integração certa", () => {
        const { wrapper, health } = setup()
        renderHook(() => useIntegrationStatusLive(["crons", "pusher"]), { wrapper })
        expect(mocks.acquire).toHaveBeenCalledWith("private-integration-crons")
        expect(mocks.acquire).toHaveBeenCalledWith("private-integration-pusher")

        const emit = mocks.handlers.get("private-integration-crons:status-updated")!
        act(() => emit({ id: "crons", checking: true }))
        expect(health("crons")).toMatchObject({ status: "error", checking: true })

        act(() => emit({ id: "crons", checking: false, health: { status: "ok", checkedAt: "2026-09-22T12:00:00.000Z" } }))
        expect(health("crons")).toMatchObject({ status: "ok", checking: false })
        expect(health("pusher")).toEqual({ status: "ok" })
    })

    it("resultado mais antigo que o exibido não sobrescreve o status", () => {
        const { client, health } = setup()
        applyIntegrationHealth(client, "crons", { status: "ok", checkedAt: "2026-09-22T09:00:00.000Z", checking: false })
        expect(health("crons").status).toBe("error")
    })

    it("sem Pusher não assina canais e o polling fica mais frequente", () => {
        mocks.available = false
        const { wrapper } = setup()
        renderHook(() => useIntegrationStatusLive(["crons"]), { wrapper })
        expect(mocks.acquire).not.toHaveBeenCalled()
        expect(statusPollInterval()).toBe(STATUS_POLL_FALLBACK_MS)
        mocks.available = true
        expect(statusPollInterval()).toBe(STATUS_POLL_REALTIME_MS)
    })
})
