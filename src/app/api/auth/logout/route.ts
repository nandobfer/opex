import { withRoute } from "@/lib/api/route"
import { ok } from "@/lib/api/responses"
import { SESSION_COOKIE_NAME } from "@/features/auth/session"
import { isHttpsRequest, sessionCookieOptions } from "@/features/auth/server/cookie"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/auth/logout — apaga o cookie de sessão. Rota pública (não há o que proteger). */
export const POST = withRoute(async ({ req }) => {
    const secure = isHttpsRequest(req.headers.get("x-forwarded-proto"), req.nextUrl.protocol)
    const response = ok({ authenticated: false })
    response.cookies.set({
        name: SESSION_COOKIE_NAME,
        value: "",
        maxAge: 0,
        ...sessionCookieOptions(secure),
    })
    return response
})
