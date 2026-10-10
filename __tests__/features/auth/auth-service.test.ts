import { afterEach, describe, expect, it } from "vitest"
import { getAppPassword, getAuthSecret, verifyPassword } from "@/features/auth/server/auth-service"

describe("senha única do app", () => {
    afterEach(() => {
        delete process.env.APP_PASSWORD
        delete process.env.AUTH_SECRET
    })

    it("aceita a senha correta e recusa a errada (inclusive tamanhos diferentes)", () => {
        expect(verifyPassword("senha-secreta", "senha-secreta")).toBe(true)
        expect(verifyPassword("senha-errada", "senha-secreta")).toBe(false)
        expect(verifyPassword("", "senha-secreta")).toBe(false)
        expect(verifyPassword("senha-secretissima", "senha-secreta")).toBe(false)
    })

    it("getAppPassword/getAuthSecret são fail-closed (null quando não configurados)", () => {
        expect(getAppPassword()).toBeNull()
        expect(getAuthSecret()).toBeNull()

        process.env.APP_PASSWORD = "   "
        process.env.AUTH_SECRET = ""
        expect(getAppPassword()).toBeNull()
        expect(getAuthSecret()).toBeNull()

        process.env.APP_PASSWORD = " ok "
        process.env.AUTH_SECRET = " segredo "
        expect(getAppPassword()).toBe("ok")
        expect(getAuthSecret()).toBe("segredo")
    })
})
