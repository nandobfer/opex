import { afterEach, describe, expect, it, vi } from "vitest"
import { GET } from "@/app/sw.js/route"

describe("rota /sw.js", () => {
    afterEach(() => vi.unstubAllEnvs())

    it("entrega o script com a versão do build, como JavaScript e sem cache HTTP", async () => {
        vi.stubEnv("APP_BUILD_ID", "2.124.0-teste")
        const response = GET()
        expect(response.status).toBe(200)
        expect(response.headers.get("Content-Type")).toBe("application/javascript; charset=utf-8")
        expect(response.headers.get("Cache-Control")).toContain("no-store")
        const body = await response.text()
        expect(body).toContain('"version":"2.124.0-teste"')
        expect(() => new Function("self", body)).not.toThrow()
    })
})
