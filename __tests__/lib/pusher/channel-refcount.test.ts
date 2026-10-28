// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest"

const pusherMock = vi.hoisted(() => {
    const subscribe = vi.fn((name: string) => ({ name }))
    const unsubscribe = vi.fn()
    return { subscribe, unsubscribe, client: { subscribe, unsubscribe } }
})

// O client.ts importa `pusher-js` (default) e instancia no browser. Mockamos o
// módulo inteiro para isolar a lógica de ref-count.
// `function` (não seta): no Vitest 5 o mock chamado com `new` precisa ser um construtor.
vi.mock("pusher-js", () => ({ default: vi.fn(function () { return pusherMock.client }) }))

import { acquireChannel, releaseChannel } from "@/lib/pusher/client"

describe("ref-count de canais Pusher (acquireChannel/releaseChannel)", () => {
    beforeEach(() => {
        pusherMock.subscribe.mockClear()
        pusherMock.unsubscribe.mockClear()
    })

    it("dois acquire no mesmo canal só fazem unsubscribe após dois releases", () => {
        acquireChannel("c1")
        acquireChannel("c1")

        // primeiro release não derruba o canal (ainda há 1 consumidor)
        releaseChannel("c1")
        expect(pusherMock.unsubscribe).not.toHaveBeenCalled()

        // segundo release (último consumidor) faz o unsubscribe
        releaseChannel("c1")
        expect(pusherMock.unsubscribe).toHaveBeenCalledTimes(1)
        expect(pusherMock.unsubscribe).toHaveBeenCalledWith("c1")
    })

    it("acquire/release balanceados de um único consumidor fazem unsubscribe", () => {
        acquireChannel("solo")
        releaseChannel("solo")
        expect(pusherMock.unsubscribe).toHaveBeenCalledTimes(1)
        expect(pusherMock.unsubscribe).toHaveBeenCalledWith("solo")
    })

    it("ciclo StrictMode (acquire→release→acquire) deixa o canal assinado", () => {
        acquireChannel("strict")
        releaseChannel("strict") // unsubscribe (ref 0)
        acquireChannel("strict") // re-subscribe

        expect(pusherMock.unsubscribe).toHaveBeenCalledTimes(1)
        // re-assinou após o ciclo — fica vivo
        releaseChannel("strict")
        expect(pusherMock.unsubscribe).toHaveBeenCalledTimes(2)
    })

    it("canais distintos têm contagem independente", () => {
        acquireChannel("a")
        acquireChannel("b")
        releaseChannel("a")
        expect(pusherMock.unsubscribe).toHaveBeenCalledWith("a")
        expect(pusherMock.unsubscribe).not.toHaveBeenCalledWith("b")
    })
})
