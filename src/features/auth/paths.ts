/**
 * Guarda de acesso: decide, por caminho e por **tipo de sessão**, o que pode passar. Função **pura**
 * e testável — o `middleware` apenas aplica a decisão.
 *
 * Rota pública = acessível sem sessão. São públicas:
 * - a tela de login e as rotas internas de auth (`/login`, `/api/auth/login`, `/api/auth/logout`,
 *   `/api/auth/client-login` — a entrada do portal por token);
 * - a **API pública por token de sistema** (`/api/v1/*`), autenticada por `requireApiToken`;
 * - o **tick do agendador de crons** (`/api/routines/*`), autenticado por `CRON_SECRET`;
 * - a **documentação OpenAPI da API interna** (`/api/openapi.json` e `/api/docs`): expõem só o
 *   contrato, nenhum dado;
 * - a **entrada do portal** (`/cliente`, exato): resolve o token (`?t=`), mostra a seleção de
 *   cliente do usuário logado ou deixa o middleware decidir. As sub-rotas do portal exigem sessão.
 *
 * A partir da entrada, a decisão considera o `kind` da sessão (`src/features/auth/session.ts`):
 * - `admin`: app completo **e** o portal (pré-visualização);
 * - `client`: só o portal (`/cliente/*` e `/api/cliente/*`), mais as rotas de auth internas
 *   (`/api/auth/*`) e o auth do Pusher (`/api/pusher/auth`); o app interno responde com redirect
 *   (páginas) ou 401 (APIs).
 */

import { BASE_PATH } from "@/lib/base-path"
import type { SessionPayload } from "./session"

/** Rotas liberadas sem sessão (comparação exata). */
export const PUBLIC_ROUTES: readonly string[] = [
    "/login",
    "/api/auth/login",
    "/api/auth/logout",
    "/api/auth/client-login",
    // Entrada do portal: resolve o token (`?t=`) antes de exigir sessão nas sub-rotas.
    "/cliente",
    // Documentação OpenAPI (contrato público; sem dados). Ver `src/app/api/openapi.json` e `api/docs`.
    "/api/openapi.json",
    "/api/docs",
]

/** Prefixos de rota liberados sem sessão (API pública por token e tick de cron). */
export const PUBLIC_PREFIXES: readonly string[] = ["/api/v1", "/api/routines"]

/**
 * Caminho sem o subcaminho público (`BASE_PATH`), com barra inicial e sem barra final.
 * Aceita tanto o `pathname` do middleware (que pode ou não incluir o `basePath`).
 */
export function normalizePath(pathname: string): string {
    let path = pathname
    if (BASE_PATH && (path === BASE_PATH || path.startsWith(`${BASE_PATH}/`))) {
        path = path.slice(BASE_PATH.length)
    }
    if (!path.startsWith("/")) path = `/${path}`
    if (path.length > 1) path = path.replace(/\/+$/, "")
    return path || "/"
}

export function isPublicPath(pathname: string): boolean {
    const path = normalizePath(pathname)
    if (PUBLIC_ROUTES.includes(path)) return true
    return PUBLIC_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

export function isApiPath(pathname: string): boolean {
    return normalizePath(pathname).startsWith("/api/")
}

/** Caminho do portal do cliente (páginas `/cliente/*` e APIs `/api/cliente/*`). */
export function isClientPath(pathname: string): boolean {
    const path = normalizePath(pathname)
    return path === "/cliente" || path.startsWith("/cliente/") || path === "/api/cliente" || path.startsWith("/api/cliente/")
}

/** Rotas de auth internas (`/api/auth/*`): exigem sessão, mas valem para os dois tipos de sessão. */
export function isAuthPath(pathname: string): boolean {
    return normalizePath(pathname).startsWith("/api/auth/")
}

/** Rotas de API liberadas também para a sessão de cliente (a própria rota confere o canal/papel). */
export const CLIENT_ALLOWED_API: readonly string[] = ["/api/pusher/auth"]

/**
 * Prefixos de API liberados também para a sessão de cliente. Os **anexos** são compartilhados com o
 * portal (o cliente envia e baixa os das suas tarefas); cada rota resolve o ator e autoriza o
 * escopo (ver `features/tasks/attachments/server/actor.ts`) — o resto de `/api/*` segue restrito.
 */
export const CLIENT_ALLOWED_API_PREFIXES: readonly string[] = ["/api/attachments"]

/** Rotas de API que a sessão de cliente pode chamar (exatas ou por prefixo). */
export function isClientAllowedApi(pathname: string): boolean {
    const path = normalizePath(pathname)
    if (CLIENT_ALLOWED_API.includes(path)) return true
    return CLIENT_ALLOWED_API_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

export type AuthAction = "allow" | "redirect" | "unauthorized"

export interface AuthDecision {
    action: AuthAction
    /** Para `redirect`: destino interno (sem `basePath`). */
    redirectTo?: string
}

/**
 * Decide o que fazer com a requisição: `allow` (segue), `redirect` (página sem acesso) ou
 * `unauthorized` (API sem acesso). `session` é o payload verificado do cookie, ou `null`.
 */
export function resolveAuthDecision(pathname: string, session: SessionPayload | null): AuthDecision {
    if (isPublicPath(pathname)) return { action: "allow" }
    if (!session) return isApiPath(pathname) ? { action: "unauthorized" } : { action: "redirect", redirectTo: "/login" }
    if (session.kind === "admin") return { action: "allow" }
    // Sessão de cliente: o portal, as rotas de auth internas (ex.: escolher cliente), o auth do Pusher e os anexos.
    if (isClientPath(pathname) || isAuthPath(pathname) || isClientAllowedApi(pathname)) return { action: "allow" }
    return isApiPath(pathname) ? { action: "unauthorized" } : { action: "redirect", redirectTo: "/cliente" }
}
