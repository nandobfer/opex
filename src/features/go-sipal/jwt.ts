/**
 * Leitura do JWT do Go! Sipal SEM verificar a assinatura (o segredo é da plataforma). Serve só
 * para saber quando a sessão expira; quem decide se o token vale é sempre a plataforma (401).
 * Módulo puro.
 */

export interface GoSipalJwtClaims {
    userId?: string
    email?: string
    name?: string
    userType?: string
    /** Expiração em segundos (padrão JWT). */
    exp?: number
    iat?: number
}

export function decodeGoSipalJwt(token: string): GoSipalJwtClaims | null {
    const payload = token.split(".")[1]
    if (!payload) return null
    try {
        const json = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
        const claims = JSON.parse(json) as unknown
        return claims && typeof claims === "object" ? (claims as GoSipalJwtClaims) : null
    } catch {
        return null
    }
}

/** Expiração do token, ou `null` quando o token não informa. */
export function goSipalTokenExpiresAt(token: string): Date | null {
    const exp = decodeGoSipalJwt(token)?.exp
    return typeof exp === "number" && Number.isFinite(exp) ? new Date(exp * 1000) : null
}
