/**
 * Hash e verificação de senha dos usuários de cliente (SOMENTE servidor / runtime Node).
 *
 * Usa **scrypt** do `node:crypto` — nunca roda no runtime Edge do middleware. O formato guardado é
 * `scrypt$N$r$p$sal$hash` (sal e hash em base64), o que permite ajustar os parâmetros no futuro sem
 * invalidar hashes antigos.
 */

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto"
import { promisify } from "node:util"

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number, options: { N: number; r: number; p: number }) => Promise<Buffer>

const PARAMS = { N: 16_384, r: 8, p: 1 } as const
const KEY_LENGTH = 64
const SALT_LENGTH = 16

/** Gera o hash da senha no formato `scrypt$N$r$p$sal$hash`. */
export async function hashPassword(password: string): Promise<string> {
    const salt = randomBytes(SALT_LENGTH)
    const derived = await scryptAsync(password, salt, KEY_LENGTH, PARAMS)
    return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString("base64")}$${derived.toString("base64")}`
}

/**
 * Confere a senha contra um hash guardado. Devolve `false` para hash ausente/malformado ou senha
 * errada — nunca lança. A comparação é em tempo constante.
 */
export async function verifyPasswordHash(password: string, stored: string | null | undefined): Promise<boolean> {
    if (!stored) return false
    const parts = stored.split("$")
    if (parts.length !== 6 || parts[0] !== "scrypt") return false
    const [, nRaw, rRaw, pRaw, saltRaw, hashRaw] = parts
    const N = Number(nRaw)
    const r = Number(rRaw)
    const p = Number(pRaw)
    if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false
    try {
        const salt = Buffer.from(saltRaw!, "base64")
        const expected = Buffer.from(hashRaw!, "base64")
        if (expected.length === 0) return false
        const derived = await scryptAsync(password, salt, expected.length, { N, r, p })
        return derived.length === expected.length && timingSafeEqual(derived, expected)
    } catch {
        return false
    }
}
