import { describe, expect, it } from "vitest"
import { hashPassword, verifyPasswordHash } from "@/features/auth/server/password"

describe("senha dos usuários (scrypt)", () => {
    it("gera hash no formato scrypt e confere a senha correta", async () => {
        const hash = await hashPassword("senha-curta")
        expect(hash.startsWith("scrypt$")).toBe(true)
        expect(await verifyPasswordHash("senha-curta", hash)).toBe(true)
    })

    it("aceita senha sem comprimento mínimo (inclusive vazia) e recusa a errada", async () => {
        const hash = await hashPassword("")
        expect(await verifyPasswordHash("", hash)).toBe(true)
        expect(await verifyPasswordHash("x", hash)).toBe(false)
        expect(await verifyPasswordHash("outra", await hashPassword("a"))).toBe(false)
    })

    it("usa salt aleatório (hashes diferentes para a mesma senha)", async () => {
        const [a, b] = await Promise.all([hashPassword("mesma"), hashPassword("mesma")])
        expect(a).not.toBe(b)
        expect(await verifyPasswordHash("mesma", a)).toBe(true)
        expect(await verifyPasswordHash("mesma", b)).toBe(true)
    })

    it("recusa hash ausente ou malformado sem lançar", async () => {
        expect(await verifyPasswordHash("x", null)).toBe(false)
        expect(await verifyPasswordHash("x", "")).toBe(false)
        expect(await verifyPasswordHash("x", "scrypt$1$2$3")).toBe(false)
        expect(await verifyPasswordHash("x", "bcrypt$16384$8$1$YQ==$Yg==")).toBe(false)
        expect(await verifyPasswordHash("x", "scrypt$nao$num$ero$YQ==$Yg==")).toBe(false)
    })
})
