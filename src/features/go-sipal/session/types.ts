/** Sessão do Go! Sipal como a tela mostra (nunca o token). Módulo puro. */

/** Código de acesso enviado por e-mail: 6 dígitos, vale 15 min (regra da plataforma). */
export const GO_SIPAL_CODE_TTL_MS = 15 * 60_000
/** Espera para pedir outro código. */
export const GO_SIPAL_RESEND_COOLDOWN_MS = 60_000

/** Evento no canal `private-integration-go_sipal` quando a sessão muda (payload vazio). */
export const GO_SIPAL_SESSION_EVENT = "session-updated"

export type GoSipalSessionStatus = "disconnected" | "connected" | "expiring" | "expired"

export interface GoSipalSessionUserDto {
    name: string | null
    email: string | null
    userType: string | null
    isDeveloper: boolean
    isDevLeader: boolean
}

export interface GoSipalPendingLoginDto {
    email: string
    requestedAt: string
    codeExpiresAt: string
    resendAvailableAt: string
    /** O código já passou dos 15 min: só resta pedir outro. */
    expired: boolean
}

export interface GoSipalSessionDto {
    status: GoSipalSessionStatus
    /** E-mail configurado na integração (destino do próximo código). */
    email: string | null
    baseUrl: string
    warningDays: number
    user: GoSipalSessionUserDto | null
    connectedAt: string | null
    expiresAt: string | null
    /** Dias inteiros restantes (arredondado para cima); `null` sem expiração conhecida. */
    daysLeft: number | null
    /** Login em andamento (aguardando o código); pode coexistir com uma sessão ativa (renovação). */
    pending: GoSipalPendingLoginDto | null
}
