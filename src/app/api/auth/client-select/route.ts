import type { NextRequest } from "next/server"
import { DomainError, parseBody, withRoute } from "@/lib/api/route"
import { ok } from "@/lib/api/responses"
import { dbConnect } from "@/lib/db"
import { OrcamentoClient } from "@/lib/db/models/Orcamento"
import { User } from "@/lib/db/models/User"
import { createSessionToken, SESSION_COOKIE_NAME } from "@/features/auth/session"
import { getAuthSecret } from "@/features/auth/server/auth-service"
import { sessionFromRequest } from "@/features/auth/server/context"
import { isHttpsRequest, sessionCookieOptions } from "@/features/auth/server/cookie"
import { clienteSelectSchema } from "@/features/orcamentos/schemas"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/auth/client-select — grava o **cliente escolhido** na sessão do usuário de cliente
 * (reemite o cookie com `clientId`, preservando a expiração original). Exige sessão de cliente.
 */
export const POST = withRoute(async ({ req }: { req: NextRequest }) => {
    const session = await sessionFromRequest(req)
    if (!session) throw new DomainError(401, "Sessão ausente ou expirada.", "UNAUTHENTICATED")
    if (session.kind !== "client") throw new DomainError(403, "Somente usuários de cliente escolhem cliente por aqui.", "FORBIDDEN")
    const secret = getAuthSecret()
    if (!secret) throw new DomainError(500, "Login indisponível no momento.", "AUTH_NOT_CONFIGURED")

    const body = await parseBody(req, clienteSelectSchema)
    if (!body.ok) return body.response

    await dbConnect()
    const user = await User.findById(session.userId!)
    if (!user || user.active === false) throw new DomainError(401, "Usuário inativo ou removido.", "UNAUTHENTICATED")
    const membership = (user.memberships ?? []).find((item) => item.clientId === body.data.clientId)
    if (!membership) throw new DomainError(403, "Você não tem acesso a este cliente.", "FORBIDDEN")
    const client = await OrcamentoClient.findOne({ _id: body.data.clientId, active: true }).lean()
    if (!client) throw new DomainError(403, "Cliente indisponível.", "CLIENT_INACTIVE")

    const now = Date.now()
    const remaining = Math.max(60, session.exp - Math.floor(now / 1000))
    const secure = isHttpsRequest(req.headers.get("x-forwarded-proto"), req.nextUrl.protocol)
    const response = ok({ clientId: body.data.clientId, clientName: client.name })
    response.cookies.set({
        name: SESSION_COOKIE_NAME,
        value: await createSessionToken(secret, { kind: "client", userId: session.userId, clientId: body.data.clientId }, now, remaining),
        ...sessionCookieOptions(secure),
    })
    return response
})
