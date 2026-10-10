/**
 * Rate limit em memória para o login (sem Redis, conforme a regra do projeto).
 *
 * O app roda em um único processo persistente (local ou Docker), então um contador por chave
 * (IP) no próprio processo basta para desencorajar força bruta. Registra as tentativas **falhas**
 * numa janela deslizante; o sucesso limpa a chave.
 */

export const RATE_LIMIT_MAX_ATTEMPTS = 5
export const RATE_LIMIT_WINDOW_MS = 15 * 60_000

const attempts = new Map<string, number[]>()

function windowed(key: string, now: number): number[] {
    return (attempts.get(key) ?? []).filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS)
}

export interface RateLimitResult {
    allowed: boolean
    retryAfterSeconds: number
}

export function checkRateLimit(key: string, now: number = Date.now()): RateLimitResult {
    const history = windowed(key, now)
    if (history.length >= RATE_LIMIT_MAX_ATTEMPTS) {
        attempts.set(key, history)
        const oldest = history[0]!
        const retryAfterSeconds = Math.max(1, Math.ceil((RATE_LIMIT_WINDOW_MS - (now - oldest)) / 1000))
        return { allowed: false, retryAfterSeconds }
    }
    return { allowed: true, retryAfterSeconds: 0 }
}

export function registerFailedAttempt(key: string, now: number = Date.now()): void {
    const history = windowed(key, now)
    history.push(now)
    attempts.set(key, history)
}

export function resetRateLimit(key: string): void {
    attempts.delete(key)
}
