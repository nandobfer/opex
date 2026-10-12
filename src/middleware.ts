import { NextResponse, type NextRequest } from "next/server"
import { BASE_PATH } from "@/lib/base-path"
import { normalizePath, resolveAuthDecision } from "@/features/auth/paths"
import { readSessionToken, SESSION_COOKIE_NAME } from "@/features/auth/session"

/**
 * Guarda de acesso do Opex. Toda página e toda API interna exigem sessão (cookie assinado) criada no
 * login. Ficam suspensas as rotas públicas do app (`/login`, `/api/auth/*`), a entrada do portal
 * (`/cliente`), a API pública por token (`/api/v1/*`) e o tick de cron (`/api/routines/*`) — as
 * regras estão em `src/features/auth/paths.ts`.
 *
 * A decisão considera o **tipo de sessão**: o dono (`kind: "admin"`) passa em tudo; o usuário de
 * cliente (`kind: "client"`) fica restrito ao portal. Resposta da tentativa sem acesso:
 * **redirect** (páginas → `/login` ou `/cliente`) ou **401 JSON** (APIs). Sem `AUTH_SECRET`
 * configurado, nunca autentica (fail-closed).
 */
export async function middleware(request: NextRequest) {
    const secret = process.env.AUTH_SECRET?.trim()
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value
    const session = secret && token ? await readSessionToken(token, secret) : null
    const decision = resolveAuthDecision(request.nextUrl.pathname, session)

    if (decision.action === "allow") return NextResponse.next()

    if (decision.action === "unauthorized") {
        return NextResponse.json(
            { success: false, error: "Sessão ausente ou expirada.", code: "UNAUTHENTICATED" },
            { status: 401 },
        )
    }

    const target = decision.redirectTo ?? "/login"
    const targetUrl = request.nextUrl.clone()
    targetUrl.pathname = `${BASE_PATH}${target}`
    targetUrl.search = ""
    if (target === "/login") {
        const next = `${normalizePath(request.nextUrl.pathname)}${request.nextUrl.search}`
        if (next !== "/login") targetUrl.searchParams.set("next", next)
    }
    return NextResponse.redirect(targetUrl)
}

export const config = {
    // Roda em tudo, menos os assets estáticos do Next e arquivos com extensão conhecida.
    matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|woff2?|ttf)$).*)"],
}
