import { describe, expect, it } from "vitest"
import { createSessionToken, readSessionToken, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS, verifySessionToken, type SessionPayload } from "@/features/auth/session"

const SECRET = "segredo-de-teste"

/** Assina um payload cru, como a versão antiga do cookie (sem `kind`). */
async function signLegacy(secret: string, payload: Record<string, unknown>): Promise<string> {
    const encoder = new TextEncoder()
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url")
    const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(encoded))
    return `${encoded}.${Buffer.from(new Uint8Array(signature)).toString("base64url")}`
}

describe("sessão assinada", () => {
    it("valida um token do dono e devolve o payload", async () => {
        const token = await createSessionToken(SECRET, { kind: "admin" })
        const payload = await readSessionToken(token, SECRET)
        expect(payload?.kind).toBe("admin")
        expect(await verifySessionToken(token, SECRET)).toBe(true)
    })

    it("a sessão de cliente carrega o usuário e (quando escolhido) o cliente", async () => {
        const token = await createSessionToken(SECRET, { kind: "client", userId: "u1", clientId: "c1" })
        expect(await readSessionToken(token, SECRET)).toMatchObject({ kind: "client", userId: "u1", clientId: "c1" })

        const withoutClient = await createSessionToken(SECRET, { kind: "client", userId: "u1" })
        const payload = await readSessionToken(withoutClient, SECRET)
        expect(payload?.clientId).toBeUndefined()
    })

    it("recusa sessão de cliente sem usuário", async () => {
        const token = await createSessionToken(SECRET, { kind: "client" })
        expect(await readSessionToken(token, SECRET)).toBeNull()
    })

    it("recusa cookie antigo (sem `kind`), mesmo com assinatura válida", async () => {
        const legacy = await signLegacy(SECRET, { iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 })
        expect(await readSessionToken(legacy, SECRET)).toBeNull()
    })

    it("recusa token com assinatura adulterada", async () => {
        const token = await createSessionToken(SECRET, { kind: "admin" })
        const [payload] = token.split(".")
        expect(await readSessionToken(`${payload}.assinatura-falsa`, SECRET)).toBeNull()
    })

    it("recusa token assinado com outro segredo", async () => {
        const token = await createSessionToken(SECRET, { kind: "admin" })
        expect(await readSessionToken(token, "outro-segredo")).toBeNull()
    })

    it("recusa token vencido", async () => {
        const now = Date.now()
        const token = await createSessionToken(SECRET, { kind: "admin" }, now, 10)
        expect(await readSessionToken(token, SECRET, now + 20_000)).toBeNull()
        expect(await readSessionToken(token, SECRET, now + 1_000)).not.toBeNull()
    })

    it("recusa token ausente, vazio ou malformado", async () => {
        expect(await readSessionToken(undefined, SECRET)).toBeNull()
        expect(await readSessionToken(null, SECRET)).toBeNull()
        expect(await readSessionToken("", SECRET)).toBeNull()
        expect(await readSessionToken("sem-ponto", SECRET)).toBeNull()
        expect(await readSessionToken("a.b", SECRET)).toBeNull()
    })

    it("fail-closed sem segredo", async () => {
        const token = await createSessionToken(SECRET, { kind: "admin" })
        expect(await readSessionToken(token, "")).toBeNull()
        expect(await verifySessionToken(token, "")).toBe(false)
    })

    it("exporta nome e teto do cookie", () => {
        expect(SESSION_COOKIE_NAME).toBe("opex_session")
        expect(SESSION_MAX_AGE_SECONDS).toBeGreaterThan(0)
    })

    it("o payload não guarda papéis nem lista de clientes", async () => {
        const token = await createSessionToken(SECRET, { kind: "client", userId: "u1", clientId: "c1" })
        const payload = (await readSessionToken(token, SECRET)) as SessionPayload & Record<string, unknown>
        expect(Object.keys(payload).sort()).toEqual(["clientId", "exp", "iat", "kind", "userId"])
    })
})
