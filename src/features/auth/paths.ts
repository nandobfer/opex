/**
 * Guarda de acesso: decide, por caminho, o que a ausência de sessão permite. Função **pura** e
 * testável — o `middleware` apenas aplica a decisão.
 *
 * Rota pública = acessível sem sessão. São públicas:
 * - a tela de login e as rotas internas de auth (`/login`, `/api/auth/login`, `/api/auth/logout`);
 * - a **API pública por token de sistema** (`/api/v1/*`), autenticada por `requireApiToken`;
 * - o **tick do agendador de crons** (`/api/routines/*`), autenticado por `CRON_SECRET`.
 *
 * Tudo o mais (páginas e APIs internas) exige o cookie de sessão.
 */

import { BASE_PATH } from "@/lib/base-path"

export type AuthAction = "allow" | "redirect" | "unauthorized"

/** Rotas liberadas sem sessão (comparação exata). */
export const PUBLIC_ROUTES: readonly string[] = ["/login", "/api/auth/login", "/api/auth/logout"]

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

/** Autenticado ou rota liberada → `allow`; API interna → `unauthorized`; página → `redirect`. */
export function resolveAuthAction(pathname: string, authenticated: boolean): AuthAction {
    if (authenticated || isPublicPath(pathname)) return "allow"
    return isApiPath(pathname) ? "unauthorized" : "redirect"
}
