import { beforeEach, describe, expect, it, vi } from "vitest"
import { buildServiceWorkerScript, serviceWorkerConfig } from "@/features/pwa/service-worker"

const ORIGIN = "https://opex.test"

type Listener = (event: Record<string, unknown>) => void

/** Caminho pedido ao `fetch` (string na instalação, `Request` no evento `fetch`). */
const pathOf = (input: RequestInfo | URL) => new URL(typeof input === "object" && "url" in input ? input.url : String(input), ORIGIN).pathname

/** Cache em memória, com a chave pelo caminho (como o Cache real resolve a URL relativa ao worker). */
class FakeCache {
    entries = new Map<string, Response>()
    private key(input: string | Request) {
        return typeof input === "string" ? new URL(input, ORIGIN).pathname : new URL(input.url).pathname
    }
    async match(input: string | Request) {
        return this.entries.get(this.key(input))?.clone()
    }
    async put(input: string | Request, response: Response) {
        this.entries.set(this.key(input), response)
    }
}

function setup(basePath = "", version = "v2") {
    const stores = new Map<string, FakeCache>([["opex-v1", new FakeCache()], ["outro-app", new FakeCache()]])
    const listeners = new Map<string, Listener>()
    const fetch = vi.fn<(input: RequestInfo | URL) => Promise<Response>>()
    const self = {
        location: { origin: ORIGIN },
        caches: {
            open: async (name: string) => stores.get(name) ?? stores.set(name, new FakeCache()).get(name)!,
            keys: async () => [...stores.keys()],
            delete: async (name: string) => stores.delete(name),
        },
        clients: { claim: vi.fn(async () => undefined) },
        fetch,
        skipWaiting: vi.fn(async () => undefined),
        addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    }
    // Executa o MESMO texto que a rota `/sw.js` entrega ao navegador.
    new Function("self", buildServiceWorkerScript(serviceWorkerConfig(version, basePath)))(self)

    async function lifecycle(type: "install" | "activate") {
        const pending: Promise<unknown>[] = []
        listeners.get(type)!({ waitUntil: (promise: Promise<unknown>) => pending.push(promise) })
        await Promise.all(pending)
    }

    function dispatchFetch(path: string, init: { method?: string; mode?: string; origin?: string } = {}) {
        const request = { url: `${init.origin ?? ORIGIN}${path}`, method: init.method ?? "GET", mode: init.mode ?? "cors" } as Request
        const respondWith = vi.fn()
        listeners.get("fetch")!({ request, respondWith })
        return { respondWith, response: respondWith.mock.calls[0]?.[0] as Promise<Response> | undefined }
    }

    return { self, stores, fetch, lifecycle, dispatchFetch }
}

const OFFLINE_HTML = `<html><head><link rel="stylesheet" href="/_next/static/css/app.css"/><link rel="preload" href="/_next/static/media/inter.woff2" as="font"/></head>
<body><h1>Sem conexão</h1><script src="/_next/static/chunks/main.js"></script><img src="/outro.png"/></body></html>`

describe("service worker do PWA", () => {
    let env: ReturnType<typeof setup>

    beforeEach(() => {
        env = setup()
        env.fetch.mockImplementation(async (input) => {
            const path = pathOf(input)
            return new Response(path === "/offline" ? OFFLINE_HTML : `conteúdo de ${path}`, { status: 200 })
        })
    })

    it("instalação guarda a página offline, os estáticos que ela usa e a marca, e ativa na hora", async () => {
        await env.lifecycle("install")
        const cache = env.stores.get("opex-v2")!
        expect([...cache.entries.keys()].sort()).toEqual(["/_next/static/chunks/main.js", "/_next/static/css/app.css", "/_next/static/media/inter.woff2", "/offline", "/opex-mark.png"])
        expect(env.self.skipWaiting).toHaveBeenCalled()
    })

    it("instalação sem rede n\u00e3o falha: o SW novo entra mesmo assim", async () => {
        env.fetch.mockRejectedValue(new TypeError("Failed to fetch"))
        await env.lifecycle("install")
        expect(env.self.skipWaiting).toHaveBeenCalled()
    })

    it("ativação apaga os caches do Opex de outras versões, preserva o resto e assume as abas", async () => {
        await env.lifecycle("install")
        await env.lifecycle("activate")
        expect([...env.stores.keys()].sort()).toEqual(["opex-v2", "outro-app"])
        expect(env.self.clients.claim).toHaveBeenCalled()
    })

    it("navegação vai pela rede e n\u00e3o \u00e9 guardada", async () => {
        await env.lifecycle("install")
        const { response } = env.dispatchFetch("/tarefas", { mode: "navigate" })
        expect(await (await response!).text()).toBe("conteúdo de /tarefas")
        expect(env.stores.get("opex-v2")!.entries.has("/tarefas")).toBe(false)
    })

    it("navegação sem rede mostra a página offline; erro HTTP passa direto", async () => {
        await env.lifecycle("install")
        env.fetch.mockRejectedValueOnce(new TypeError("Failed to fetch"))
        const offline = env.dispatchFetch("/tarefas", { mode: "navigate" }).response!
        expect(await (await offline).text()).toContain("Sem conexão")

        env.fetch.mockResolvedValueOnce(new Response("falhou", { status: 500 }))
        const serverError = await env.dispatchFetch("/tarefas", { mode: "navigate" }).response!
        expect(serverError.status).toBe(500)
    })

    it("n\u00e3o intercepta API, POST, outra origem nem páginas fora da navegação", () => {
        for (const call of [
            env.dispatchFetch("/api/tasks"),
            env.dispatchFetch("/api/tasks", { method: "POST" }),
            env.dispatchFetch("/_next/static/x.js", { origin: "https://cdn.test" }),
            env.dispatchFetch("/api/auth/login", { method: "POST", mode: "navigate" }),
            env.dispatchFetch("/tarefas?_rsc=1"),
        ]) {
            expect(call.respondWith).not.toHaveBeenCalled()
        }
    })

    it("/_next/static responde do cache primeiro e guarda o que vier da rede", async () => {
        await env.lifecycle("install")
        env.fetch.mockClear()
        const cached = await env.dispatchFetch("/_next/static/css/app.css").response!
        expect(await cached.text()).toBe("conteúdo de /_next/static/css/app.css")
        expect(env.fetch).not.toHaveBeenCalled()

        const fresh = await env.dispatchFetch("/_next/static/chunks/novo.js").response!
        expect(await fresh.text()).toBe("conteúdo de /_next/static/chunks/novo.js")
        expect(env.stores.get("opex-v2")!.entries.has("/_next/static/chunks/novo.js")).toBe(true)
    })

    it("com subcaminho público, usa o prefixo na página offline e nos estáticos", async () => {
        const base = "/dev_automacao/tarefas-fernando"
        const scoped = setup(base)
        scoped.fetch.mockImplementation(async (input) => {
            const path = pathOf(input)
            return new Response(path === `${base}/offline` ? OFFLINE_HTML.replaceAll("/_next/", `${base}/_next/`) : "ok")
        })
        await scoped.lifecycle("install")
        expect([...scoped.stores.get("opex-v2")!.entries.keys()]).toContain(`${base}/offline`)
        expect([...scoped.stores.get("opex-v2")!.entries.keys()]).toContain(`${base}/_next/static/css/app.css`)
        expect(scoped.dispatchFetch(`${base}/_next/static/css/app.css`).respondWith).toHaveBeenCalled()
    })

    it("o script carrega a versão do build (cada deploy gera um SW diferente)", () => {
        const a = buildServiceWorkerScript(serviceWorkerConfig("2.0.0-aaa", ""))
        const b = buildServiceWorkerScript(serviceWorkerConfig("2.0.0-bbb", ""))
        expect(a).toContain('"version":"2.0.0-aaa"')
        expect(a).not.toBe(b)
    })
})
