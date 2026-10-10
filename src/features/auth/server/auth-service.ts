/**
 * Serviço do login por senha única (`APP_PASSWORD`) — sem usuários, sem cadastro.
 *
 * Fail-closed: sem `APP_PASSWORD` ou sem `AUTH_SECRET`, o login fica indisponível e a rota recusa
 * qualquer tentativa. A comparação da senha é feita sobre o **hash SHA-256** dos dois valores,
 * o que mantém o tempo de resposta constante e independente do tamanho digitado.
 */

import { createHash, timingSafeEqual } from "node:crypto"

export function getAppPassword(): string | null {
    const value = process.env.APP_PASSWORD?.trim()
    return value ? value : null
}

export function getAuthSecret(): string | null {
    const value = process.env.AUTH_SECRET?.trim()
    return value ? value : null
}

/** Comparação em tempo constante entre a senha digitada e a esperada. */
export function verifyPassword(provided: string, expected: string): boolean {
    const providedHash = createHash("sha256").update(provided, "utf8").digest()
    const expectedHash = createHash("sha256").update(expected, "utf8").digest()
    return timingSafeEqual(providedHash, expectedHash)
}
