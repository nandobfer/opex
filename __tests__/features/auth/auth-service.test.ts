import { afterEach, describe, expect, it } from "vitest"
import { getAdminCredentials, getAuthSecret, isAdminIdentifier, verifySecret } from "@/features/auth/server/auth-service"

describe("credenciais do dono (ADMIN_*)", () => {
    afterEach(() => {
        delete process.env.ADMIN_USER
        delete process.env.ADMIN_EMAIL
        delete process.env.ADMIN_PASSWORD
        delete process.env.AUTH_SECRET
    })

    it("verifySecret aceita o segredo correto e recusa o errado (inclusive tamanhos diferentes)", () => {
        expect(verifySecret("senha-secreta", "senha-secreta")).toBe(true)
        expect(verifySecret("senha-errada", "senha-secreta")).toBe(false)
        expect(verifySecret("", "senha-secreta")).toBe(false)
        expect(verifySecret("senha-secretissima", "senha-secreta")).toBe(false)
    })

    it("getAdminCredentials é fail-closed (null quando usuário ou senha faltam)", () => {
        expect(getAdminCredentials()).toBeNull()

        process.env.ADMIN_USER = " fernando "
        expect(getAdminCredentials()).toBeNull()

        process.env.ADMIN_PASSWORD = " secreta "
        expect(getAdminCredentials()).toEqual({ user: "fernando", email: null, password: "secreta" })

        process.env.ADMIN_EMAIL = " f@exemplo.com "
        expect(getAdminCredentials()).toEqual({ user: "fernando", email: "f@exemplo.com", password: "secreta" })
    })

    it("getAuthSecret é fail-closed e normaliza espaços", () => {
        expect(getAuthSecret()).toBeNull()
        process.env.AUTH_SECRET = "  "
        expect(getAuthSecret()).toBeNull()
        process.env.AUTH_SECRET = " segredo "
        expect(getAuthSecret()).toBe("segredo")
    })

    it("isAdminIdentifier aceita o usuário ou o email, sem diferenciar maiúsculas", () => {
        const credentials = { user: "Fernando", email: "dono@opex.dev", password: "x" }
        expect(isAdminIdentifier("fernando", credentials)).toBe(true)
        expect(isAdminIdentifier("FERNANDO", credentials)).toBe(true)
        expect(isAdminIdentifier("dono@opex.dev", credentials)).toBe(true)
        expect(isAdminIdentifier(" Outro ", credentials)).toBe(false)
    })

    it("sem email configurado, só o username identifica o dono", () => {
        const credentials = { user: "fernando", email: null, password: "x" }
        expect(isAdminIdentifier("dono@opex.dev", credentials)).toBe(false)
    })
})
