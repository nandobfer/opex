/**
 * Constantes do PWA (OPE-196): nome, cores e caminhos usados pelo manifest, pelo `viewport` do layout
 * raiz e pelo service worker. Módulo **puro** (servidor, navegador e testes).
 *
 * As cores são hex porque o manifest e o `theme-color` não aceitam variáveis CSS: `PWA_BACKGROUND` é o
 * `--background` do tema escuro (`hsl(260 22% 6%)`, conferido por teste contra o `globals.css`) e
 * `PWA_PRIMARY` é a primária `#8000FF`.
 */

export const PWA_NAME = "Opex"
export const PWA_DESCRIPTION = "Tarefas, apontamento de horas e desenvolvimento agêntico, com integrações."

export const PWA_BACKGROUND = "#0E0C13"
export const PWA_PRIMARY = "#8000FF"

/** Ícones do manifest (em `public/`, sem o `BASE_PATH`). */
export const PWA_ICONS = [
    { src: "/pwa/icon-192.png", sizes: "192x192", purpose: "any" },
    { src: "/pwa/icon-512.png", sizes: "512x512", purpose: "any" },
    { src: "/pwa/icon-maskable-512.png", sizes: "512x512", purpose: "maskable" },
] as const

/** Página mostrada pelo service worker quando a navegação falha sem rede. */
export const PWA_OFFLINE_PATH = "/offline"
/** Script do service worker (rota `src/app/sw.js/route.ts`). */
export const PWA_SERVICE_WORKER_PATH = "/sw.js"
/** Manifest gerado pela rota de metadados `src/app/manifest.ts`. */
export const PWA_MANIFEST_PATH = "/manifest.webmanifest"

/** Rotas do PWA liberadas sem sessão (o Chrome busca o manifest e o SW sem cookie). */
export const PWA_PUBLIC_ROUTES = [PWA_MANIFEST_PATH, PWA_SERVICE_WORKER_PATH, PWA_OFFLINE_PATH] as const

/** Prefixo dos caches do service worker: só os caches com este prefixo são apagados na troca de versão. */
export const PWA_CACHE_PREFIX = "opex-"
