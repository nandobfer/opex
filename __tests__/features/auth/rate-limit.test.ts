import { describe, expect, it } from "vitest"
import { checkRateLimit, RATE_LIMIT_MAX_ATTEMPTS, registerFailedAttempt, resetRateLimit } from "@/features/auth/server/rate-limit"

describe("rate limit do login", () => {
    it("bloqueia após o limite de falhas e libera depois da janela", () => {
        const key = `ip-${Math.random()}`
        const now = 1_000_000

        for (let i = 0; i < RATE_LIMIT_MAX_ATTEMPTS; i++) {
            expect(checkRateLimit(key, now).allowed).toBe(true)
            registerFailedAttempt(key, now)
        }

        const blocked = checkRateLimit(key, now)
        expect(blocked.allowed).toBe(false)
        expect(blocked.retryAfterSeconds).toBeGreaterThan(0)

        // 16 min depois, a janela de 15 min já passou.
        expect(checkRateLimit(key, now + 16 * 60_000).allowed).toBe(true)
    })

    it("reset limpa as falhas da chave", () => {
        const key = `ip-${Math.random()}`
        registerFailedAttempt(key, 1)
        resetRateLimit(key)
        expect(checkRateLimit(key, 1).allowed).toBe(true)
    })

    it("chaves diferentes não interferem", () => {
        const now = 2_000_000
        for (let i = 0; i < RATE_LIMIT_MAX_ATTEMPTS; i++) registerFailedAttempt("ip-a", now)
        expect(checkRateLimit("ip-a", now).allowed).toBe(false)
        expect(checkRateLimit("ip-b", now).allowed).toBe(true)
    })
})
