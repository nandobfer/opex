import { NextResponse, type NextRequest } from "next/server"
import { BASE_PATH } from "@/lib/base-path"
import { logger } from "@/lib/logger"
import { createSessionToken, SESSION_COOKIE_NAME } from "@/features/auth/session"
import { getAuthSecret } from "@/features/auth/server/auth-service"
import { isHttpsRequest, sessionCookieOptions } from "@/features/auth/server/cookie"
import { ORCAMENTOS_BASE_PATH, CLIENTE_TOKEN_PARAM } from "@/features/orcamentos/constants"
import { activeMemberships } from "@/features/orcamentos/server/users"
import { resolveUserByToken } from "@/features/orcamentos/server/token"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function redirectTo(path: string, search?: Record<string, string>): NextResponse {
    const url = new URL(`${BASE_PATH}${path}`, "http://placeholder")
    if (search) for (const [key, value] of Object.entries(search)) url.searchParams.set(key, value)
    return new NextResponse(null, { status: 307, headers: { Location: `${url.pathname}${url.search}`, "Cache-Control": "no-store" } })
}

/**
 * GET /api/auth/client-login?t=… — **entrada do portal por URL**: troca o token por uma sessão
 * (`kind: "client"`) e redireciona para `/cliente`. Rota pública. Token ausente/inválido cai na tela
 * de login sem sessão. O token não permanece na URL depois do redirect.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
    const token = request.nextUrl.searchParams.get(CLIENTE_TOKEN_PARAM)
    const secret = getAuthSecret()
    if (!secret) return redirectTo("/login")

    const user = await resolveUserByToken(token)
    if (!user) {
        logger.warn("[auth] Link do portal com token inválido")
        return redirectTo("/login", { portal: "link-invalido" })
    }

    const memberships = await activeMemberships(user)
    if (memberships.length === 0) return redirectTo("/login", { portal: "sem-cliente" })
    const clientId = memberships.length === 1 ? memberships[0]!.clientId : undefined

    const secure = isHttpsRequest(request.headers.get("x-forwarded-proto"), request.nextUrl.protocol)
    const response = redirectTo(ORCAMENTOS_BASE_PATH)
    response.cookies.set({ name: SESSION_COOKIE_NAME, value: await createSessionToken(secret, { kind: "client", userId: String(user._id), clientId }), ...sessionCookieOptions(secure) })
    return response
}
