import type { NextRequest } from "next/server"
import { DomainError, parseBody, withRoute } from "@/lib/api/route"
import { ok } from "@/lib/api/responses"
import { logger } from "@/lib/logger"
import { loginSchema } from "@/features/auth/schemas"
import { createSessionToken, SESSION_COOKIE_NAME } from "@/features/auth/session"
import { getAdminCredentials, getAuthSecret, isAdminIdentifier, verifySecret } from "@/features/auth/server/auth-service"
import { verifyPasswordHash } from "@/features/auth/server/password"
import { isHttpsRequest, sessionCookieOptions } from "@/features/auth/server/cookie"
import { checkRateLimit, registerFailedAttempt, resetRateLimit } from "@/features/auth/server/rate-limit"
import { HOME_HREF } from "@/features/layout/navigation"
import { ORCAMENTOS_BASE_PATH } from "@/features/orcamentos/constants"
import { activeMemberships, findActiveUserByLogin } from "@/features/orcamentos/server/users"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Chave do rate limit: IP do cliente atrás do proxy, ou `local` no acesso direto. */
function clientKey(req: NextRequest): string {
    const forwarded = req.headers.get("x-forwarded-for")
    if (forwarded) return forwarded.split(",")[0]!.trim() || "local"
    return req.headers.get("x-real-ip")?.trim() || "local"
}

/**
 * POST /api/auth/login — autentica o **dono** (`ADMIN_USER`/`ADMIN_EMAIL` + `ADMIN_PASSWORD`) ou um
 * **usuário de cliente** (username/email + senha, scrypt). Rota pública (não exige sessão).
 * 401 credenciais inválidas, 429 tentativas demais, 500 sem `AUTH_SECRET`.
 *
 * O formulário é único: o destino (`redirectTo`) distingue dono (`/dashboard`) de usuário de cliente
 * (`/cliente`).
 */
export const POST = withRoute(async ({ req }) => {
    const body = await parseBody(req, loginSchema)
    if (!body.ok) return body.response

    const secret = getAuthSecret()
    if (!secret) {
        logger.error("[auth] Login indisponível: AUTH_SECRET não configurado")
        throw new DomainError(500, "Login indisponível no momento.", "AUTH_NOT_CONFIGURED")
    }

    const key = clientKey(req)
    const limit = checkRateLimit(key)
    if (!limit.allowed) {
        logger.warn({ ip: key }, "[auth] Tentativas de login acima do limite")
        throw new DomainError(429, `Muitas tentativas. Tente novamente em ${limit.retryAfterSeconds}s.`, "RATE_LIMITED")
    }

    const { identifier, password } = body.data
    const secure = isHttpsRequest(req.headers.get("x-forwarded-proto"), req.nextUrl.protocol)
    const cookieOptions = sessionCookieOptions(secure)

    // 1) Dono do Opex.
    const admin = getAdminCredentials()
    if (admin && isAdminIdentifier(identifier, admin)) {
        if (!verifySecret(password, admin.password)) {
            registerFailedAttempt(key)
            logger.warn({ ip: key, kind: "admin" }, "[auth] Senha do dono incorreta")
            throw new DomainError(401, "Usuário ou senha incorretos.", "INVALID_CREDENTIALS")
        }
        resetRateLimit(key)
        const response = ok({ authenticated: true, redirectTo: HOME_HREF })
        response.cookies.set({ name: SESSION_COOKIE_NAME, value: await createSessionToken(secret, { kind: "admin" }), ...cookieOptions })
        return response
    }

    // 2) Usuário de cliente.
    const user = await findActiveUserByLogin(identifier)
    const valid = user && user.active !== false && user.passwordHash ? await verifyPasswordHash(password, user.passwordHash) : false
    if (!valid || !user) {
        registerFailedAttempt(key)
        logger.warn({ ip: key, kind: "client" }, "[auth] Credenciais de cliente inválidas")
        throw new DomainError(401, "Usuário ou senha incorretos.", "INVALID_CREDENTIALS")
    }

    resetRateLimit(key)
    const memberships = await activeMemberships(user)
    if (memberships.length === 0) {
        logger.warn({ userId: String(user._id) }, "[auth] Usuário sem cliente ativo")
        throw new DomainError(403, "Nenhum cliente ativo disponível para este usuário.", "NO_ACTIVE_CLIENT")
    }
    const clientId = memberships.length === 1 ? memberships[0]!.clientId : undefined
    const response = ok({ authenticated: true, redirectTo: ORCAMENTOS_BASE_PATH })
    response.cookies.set({ name: SESSION_COOKIE_NAME, value: await createSessionToken(secret, { kind: "client", userId: String(user._id), clientId }), ...cookieOptions })
    return response
})
