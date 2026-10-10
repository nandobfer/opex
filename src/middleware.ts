import { NextResponse, type NextRequest } from "next/server"
import { BASE_PATH } from "@/lib/base-path"
import { normalizePath, resolveAuthAction } from "@/features/auth/paths"
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/features/auth/session"

/**
 * Guarda de acesso do Opex. O app passou a ser publicado na internet, então toda página e toda API
 * interna exigem a sessão (cookie assinado) criada no login. Ficam suspensas as rotas públicas do
 * app (`/login`, `/api/auth/*`), a API pública por token (`/api/v1/*`) e o tick de cron
 * (`/api/routines/*`) — as regras estão em `src/features/auth/paths.ts`.
 *
 * Resposta da tentativa sem sessão: **redirect** para `/login?next=…` (páginas) ou **401 JSON**
 * (APIs internas). Sem `AUTH_SECRET` configurado, nunca autentica (fail-closed).
 */
export async function middleware(request: NextRequest) {
    const secret = process.env.AUTH_SECRET?.trim()
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value
    const authenticated = Boolean(secret && token) && (await verifySessionToken(token, secret!))
    const action = resolveAuthAction(request.nextUrl.pathname, authenticated)

    if (action === "allow") return NextResponse.next()

    if (action === "unauthorized") {
        return NextResponse.json(
            { success: false, error: "Sessão ausente ou expirada.", code: "UNAUTHENTICATED" },
            { status: 401 },
        )
    }

    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = `${BASE_PATH}/login`
    loginUrl.search = ""
    const next = `${normalizePath(request.nextUrl.pathname)}${request.nextUrl.search}`
    if (next !== "/login") loginUrl.searchParams.set("next", next)
    return NextResponse.redirect(loginUrl)
}

export const config = {
    // Roda em tudo, menos os assets estáticos do Next e arquivos com extensão conhecida.
    matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|woff2?|ttf)$).*)"],
}
