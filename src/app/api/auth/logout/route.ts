import { withRoute } from "@/lib/api/route"
import { ok } from "@/lib/api/responses"
import { SESSION_COOKIE_NAME } from "@/features/auth/session"
import { isHttpsRequest, sessionCookieOptions } from "@/features/auth/server/cookie"
import { PREVIEW_CLIENT_COOKIE } from "@/features/orcamentos/constants"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/auth/logout — apaga o cookie de sessão (e o da pré-visualização). Rota pública. */
export const POST = withRoute(async ({ req }) => {
    const secure = isHttpsRequest(req.headers.get("x-forwarded-proto"), req.nextUrl.protocol)
    const response = ok({ authenticated: false })
    response.cookies.set({
        name: SESSION_COOKIE_NAME,
        value: "",
        maxAge: 0,
        ...sessionCookieOptions(secure),
    })
    response.cookies.set({ name: PREVIEW_CLIENT_COOKIE, value: "", maxAge: 0, httpOnly: true, sameSite: "lax", path: "/" })
    return response
})
