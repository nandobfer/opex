/**
 * Credenciais do **dono** do Opex (vêm do `.env`, não da tela de integrações).
 *
 * Substituem a antiga senha única `APP_PASSWORD`: o dono entra com `ADMIN_USER` **ou**
 * `ADMIN_EMAIL` + `ADMIN_PASSWORD`. Fail-closed: sem usuário/email/senha (ou sem `AUTH_SECRET`), o
 * login do dono fica indisponível. A comparação é feita sobre o **hash SHA-256** dos dois valores,
 * mantendo o tempo de resposta constante e independente do tamanho digitado.
 */

import { createHash, timingSafeEqual } from "node:crypto"

export function getAuthSecret(): string | null {
    const value = process.env.AUTH_SECRET?.trim()
    return value ? value : null
}

export interface AdminCredentials {
    /** Identificador de usuário do dono (`ADMIN_USER`). */
    user: string
    /** Email do dono (`ADMIN_EMAIL`), opcional. */
    email: string | null
    /** Senha do dono (`ADMIN_PASSWORD`). */
    password: string
}

/** Credenciais do dono, ou `null` quando incompletas (fail-closed). */
export function getAdminCredentials(): AdminCredentials | null {
    const user = process.env.ADMIN_USER?.trim()
    const password = process.env.ADMIN_PASSWORD?.trim()
    if (!user || !password) return null
    return { user, email: process.env.ADMIN_EMAIL?.trim() || null, password }
}

/** Comparação em tempo constante entre dois segredos (senhas). */
export function verifySecret(provided: string, expected: string): boolean {
    const providedHash = createHash("sha256").update(provided, "utf8").digest()
    const expectedHash = createHash("sha256").update(expected, "utf8").digest()
    return timingSafeEqual(providedHash, expectedHash)
}

/** `true` quando o identificador digitado é o usuário ou o email do dono (case-insensitive). */
export function isAdminIdentifier(identifier: string, credentials: AdminCredentials): boolean {
    const value = identifier.trim().toLowerCase()
    if (credentials.user.toLowerCase() === value) return true
    return Boolean(credentials.email) && credentials.email!.toLowerCase() === value
}
