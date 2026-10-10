import { withRoute } from "@/lib/api/route"
import { ok } from "@/lib/api/responses"
import { SESSION_COOKIE_NAME } from "@/features/auth/session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/auth/logout — apaga o cookie de sessão. Rota pública (não há o que proteger). */
export const POST = withRoute(async () => {
    const response = ok({ authenticated: false })
    response.cookies.set({
        name: SESSION_COOKIE_NAME,
        value: "",
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 0,
    })
    return response
})
