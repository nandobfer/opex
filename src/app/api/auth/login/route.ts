import type { NextRequest } from "next/server"
import { DomainError, parseBody, withRoute } from "@/lib/api/route"
import { ok } from "@/lib/api/responses"
import { logger } from "@/lib/logger"
import { loginSchema } from "@/features/auth/schemas"
import { createSessionToken, SESSION_COOKIE_NAME } from "@/features/auth/session"
import { getAppPassword, getAuthSecret, verifyPassword } from "@/features/auth/server/auth-service"
import { checkRateLimit, registerFailedAttempt, resetRateLimit } from "@/features/auth/server/rate-limit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Chave do rate limit: IP do cliente atrás do proxy, ou `local` no acesso direto. */
function clientKey(req: NextRequest): string {
    const forwarded = req.headers.get("x-forwarded-for")
    if (forwarded) return forwarded.split(",")[0]!.trim() || "local"
    return req.headers.get("x-real-ip")?.trim() || "local"
}

function sessionCookieOptions() {
    return {
        httpOnly: true,
        sameSite: "lax" as const,
        secure: process.env.NODE_ENV === "production",
        path: "/",
    }
}

/**
 * POST /api/auth/login — valida a senha única (`APP_PASSWORD`) e emite o cookie de sessão.
 * Rota pública (não exige sessão). 401 senha incorreta, 429 tentativas demais, 500 sem configuração.
 */
export const POST = withRoute(async ({ req }) => {
    const body = await parseBody(req, loginSchema)
    if (!body.ok) return body.response

    const password = getAppPassword()
    const secret = getAuthSecret()
    if (!password || !secret) {
        logger.error("[auth] Login indisponível: APP_PASSWORD/AUTH_SECRET não configurados")
        throw new DomainError(500, "Login indisponível no momento.", "AUTH_NOT_CONFIGURED")
    }

    const key = clientKey(req)
    const limit = checkRateLimit(key)
    if (!limit.allowed) {
        logger.warn({ ip: key }, "[auth] Tentativas de login acima do limite")
        throw new DomainError(
            429,
            `Muitas tentativas. Tente novamente em ${limit.retryAfterSeconds}s.`,
            "RATE_LIMITED",
        )
    }

    if (!verifyPassword(body.data.password, password)) {
        registerFailedAttempt(key)
        logger.warn({ ip: key }, "[auth] Senha incorreta")
        throw new DomainError(401, "Senha incorreta.", "INVALID_CREDENTIALS")
    }

    resetRateLimit(key)
    const response = ok({ authenticated: true })
    response.cookies.set({ name: SESSION_COOKIE_NAME, value: await createSessionToken(secret), ...sessionCookieOptions() })
    return response
})
