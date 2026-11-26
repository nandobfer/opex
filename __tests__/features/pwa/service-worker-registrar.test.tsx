/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, render } from "@testing-library/react"
import { ServiceWorkerRegistrar } from "@/features/pwa/components/ServiceWorkerRegistrar"

const update = vi.fn(async () => undefined)
const register = vi.fn(async () => ({ update }))

function setSecure(value: boolean) {
    Object.defineProperty(window, "isSecureContext", { configurable: true, value })
}

function setServiceWorker(available: boolean) {
    if (available) Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { register } })
    else Reflect.deleteProperty(navigator, "serviceWorker")
}

describe("registro do service worker", () => {
    beforeEach(() => {
        register.mockClear()
        update.mockClear()
        vi.stubEnv("NODE_ENV", "production")
        setSecure(true)
        setServiceWorker(true)
    })

    afterEach(() => {
        vi.unstubAllEnvs()
        setServiceWorker(false)
    })

    it("em produção registra /sw.js na raiz do app, sem cache HTTP do script", async () => {
        await act(async () => {
            render(<ServiceWorkerRegistrar />)
        })
        expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/", updateViaCache: "none" })
    })

    it("ao voltar para o app confere se há versão nova", async () => {
        await act(async () => {
            render(<ServiceWorkerRegistrar />)
        })
        Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" })
        document.dispatchEvent(new Event("visibilitychange"))
        expect(update).toHaveBeenCalledTimes(1)
    })

    it("não registra em desenvolvimento, fora de contexto seguro nem sem suporte", async () => {
        vi.stubEnv("NODE_ENV", "development")
        await act(async () => {
            render(<ServiceWorkerRegistrar />)
        })
        vi.stubEnv("NODE_ENV", "production")
        setSecure(false)
        await act(async () => {
            render(<ServiceWorkerRegistrar />)
        })
        setSecure(true)
        setServiceWorker(false)
        await act(async () => {
            render(<ServiceWorkerRegistrar />)
        })
        expect(register).not.toHaveBeenCalled()
    })
})
