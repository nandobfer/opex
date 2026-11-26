import { PWA_CACHE_PREFIX, PWA_OFFLINE_PATH } from "./constants"

/**
 * Service worker do PWA (OPE-196). A lógica fica em `opexServiceWorker`, uma função **autocontida**
 * (sem imports nem referências de fora do próprio corpo): a rota `src/app/sw.js/route.ts` a converte
 * em texto (`buildServiceWorkerScript`) e a chama com a configuração em JSON. Assim o mesmo código roda
 * no navegador e nos testes, com um `self` simulado.
 *
 * Regras:
 * - **instalação**: guarda a página offline e os arquivos de `/_next/static` que ela referencia (CSS,
 *   JS e fontes), mais os itens de `precache`; depois `skipWaiting()`;
 * - **ativação**: apaga os caches do Opex de outras versões e assume as abas (`clients.claim()`);
 * - **navegação**: sempre pela rede, sem guardar a resposta; só quando o `fetch` falha (sem rede)
 *   devolve a página offline. Resposta HTTP de erro passa direto;
 * - **`/_next/static`** (arquivos versionados) e os itens de `precache`: cache primeiro;
 * - todo o resto (`/api/*`, sessão, Pusher, outra origem, métodos que não são `GET`) não é
 *   interceptado: nada de dado do app vai para o cache.
 */

export interface ServiceWorkerConfig {
    /** Versão do build: muda a cada deploy, o que troca o SW e o nome do cache. */
    version: string
    /** Subcaminho público (`BASE_PATH`), `""` na raiz. */
    basePath: string
    cachePrefix: string
    offlinePath: string
    /** Caminhos (sem `basePath`) guardados na instalação e servidos do cache. */
    precache: string[]
}

export interface ServiceWorkerEvent {
    waitUntil(promise: Promise<unknown>): void
}

export interface ServiceWorkerFetchEvent extends ServiceWorkerEvent {
    request: Request
    respondWith(response: Response | Promise<Response>): void
}

/** Parte do `ServiceWorkerGlobalScope` usada pelo Opex (o `self` do worker). */
export interface ServiceWorkerScope {
    location: { origin: string }
    caches: CacheStorage
    clients: { claim(): Promise<void> }
    fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>
    skipWaiting(): Promise<void>
    addEventListener(type: "install" | "activate", listener: (event: ServiceWorkerEvent) => void): void
    addEventListener(type: "fetch", listener: (event: ServiceWorkerFetchEvent) => void): void
}

export function opexServiceWorker(sw: ServiceWorkerScope, config: ServiceWorkerConfig): void {
    const cacheName = config.cachePrefix + config.version
    const offlineUrl = config.basePath + config.offlinePath
    const staticPrefix = config.basePath + "/_next/static/"
    const precached = config.precache.map((path) => config.basePath + path)

    function staticAssets(html: string): string[] {
        const found = new Set<string>()
        const pattern = /(?:href|src)="([^"]+)"/g
        let match = pattern.exec(html)
        while (match) {
            const url = match[1].replace(/&amp;/g, "&")
            if (url.startsWith(staticPrefix)) found.add(url)
            match = pattern.exec(html)
        }
        return Array.from(found)
    }

    async function store(cache: Cache, url: string): Promise<void> {
        try {
            const response = await sw.fetch(url, { cache: "reload" })
            if (response.ok) await cache.put(url, response)
        } catch {
            // Sem rede na instalação: o item fica de fora e é buscado de novo na próxima versão.
        }
    }

    async function install(): Promise<void> {
        const cache = await sw.caches.open(cacheName)
        try {
            const response = await sw.fetch(offlineUrl, { cache: "reload" })
            if (response.ok) {
                const html = await response.clone().text()
                await cache.put(offlineUrl, response)
                await Promise.all(staticAssets(html).map((url) => store(cache, url)))
            }
        } catch {
            // Sem a página offline, a navegação sem rede cai no erro padrão do navegador.
        }
        await Promise.all(precached.map((url) => store(cache, url)))
        await sw.skipWaiting()
    }

    async function activate(): Promise<void> {
        const keys = await sw.caches.keys()
        await Promise.all(keys.filter((key) => key.startsWith(config.cachePrefix) && key !== cacheName).map((key) => sw.caches.delete(key)))
        await sw.clients.claim()
    }

    async function offlineFallback(): Promise<Response> {
        const cache = await sw.caches.open(cacheName)
        const page = await cache.match(offlineUrl)
        return page || Response.error()
    }

    async function cacheFirst(request: Request): Promise<Response> {
        const cache = await sw.caches.open(cacheName)
        const hit = await cache.match(request)
        if (hit) return hit
        const response = await sw.fetch(request)
        if (response.ok) await cache.put(request, response.clone())
        return response
    }

    sw.addEventListener("install", (event) => event.waitUntil(install()))
    sw.addEventListener("activate", (event) => event.waitUntil(activate()))
    sw.addEventListener("fetch", (event) => {
        const request = event.request
        if (request.method !== "GET") return
        const url = new URL(request.url)
        if (url.origin !== sw.location.origin) return
        if (request.mode === "navigate") {
            event.respondWith(sw.fetch(request).catch(offlineFallback))
            return
        }
        if (url.pathname.startsWith(staticPrefix) || precached.includes(url.pathname)) event.respondWith(cacheFirst(request))
    })
}

/** Configuração do SW para o build atual. */
export function serviceWorkerConfig(version: string, basePath: string): ServiceWorkerConfig {
    return { version, basePath, cachePrefix: PWA_CACHE_PREFIX, offlinePath: PWA_OFFLINE_PATH, precache: ["/opex-mark.png"] }
}

/** Texto do script do service worker: a função autocontida chamada com a configuração em JSON. */
export function buildServiceWorkerScript(config: ServiceWorkerConfig): string {
    return `/* Opex service worker ${config.version} */\n(${opexServiceWorker.toString()})(self, ${JSON.stringify(config)});\n`
}
