import { describe, expect, it } from "vitest"
import { createSessionToken, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS, verifySessionToken } from "@/features/auth/session"

const SECRET = "segredo-de-teste"

describe("sessão assinada", () => {
    it("valida um token recém-criado", async () => {
        const token = await createSessionToken(SECRET)
        expect(await verifySessionToken(token, SECRET)).toBe(true)
    })

    it("recusa token com assinatura adulterada", async () => {
        const token = await createSessionToken(SECRET)
        const [payload] = token.split(".")
        expect(await verifySessionToken(`${payload}.assinatura-falsa`, SECRET)).toBe(false)
    })

    it("recusa token assinado com outro segredo", async () => {
        const token = await createSessionToken(SECRET)
        expect(await verifySessionToken(token, "outro-segredo")).toBe(false)
    })

    it("recusa token vencido", async () => {
        const now = Date.now()
        const token = await createSessionToken(SECRET, now, 10)
        expect(await verifySessionToken(token, SECRET, now + 20_000)).toBe(false)
        expect(await verifySessionToken(token, SECRET, now + 1_000)).toBe(true)
    })

    it("recusa token ausente, vazio ou malformado", async () => {
        expect(await verifySessionToken(undefined, SECRET)).toBe(false)
        expect(await verifySessionToken(null, SECRET)).toBe(false)
        expect(await verifySessionToken("", SECRET)).toBe(false)
        expect(await verifySessionToken("sem-ponto", SECRET)).toBe(false)
        expect(await verifySessionToken("a.b", SECRET)).toBe(false)
    })

    it("recusa qualquer token sem segredo (fail-closed)", async () => {
        const token = await createSessionToken(SECRET)
        expect(await verifySessionToken(token, "")).toBe(false)
    })

    it("exporta nome e teto do cookie", () => {
        expect(SESSION_COOKIE_NAME).toBe("opex_session")
        expect(SESSION_MAX_AGE_SECONDS).toBeGreaterThan(0)
    })
})
