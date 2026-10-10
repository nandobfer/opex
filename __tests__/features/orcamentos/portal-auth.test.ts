import { describe, expect, it } from "vitest"
import { isPublicPath, resolveAuthAction } from "@/features/auth/paths"

describe("guarda de acesso do portal do cliente", () => {
    it("libera as páginas e APIs do portal sem sessão", () => {
        for (const path of ["/cliente", "/cliente/nova", "/cliente/revisao/abc", "/api/cliente", "/api/cliente/tasks", "/api/cliente/drafts/abc/preview"]) {
            expect(isPublicPath(path)).toBe(true)
            expect(resolveAuthAction(path, false)).toBe("allow")
        }
    })

    it("não libera caminhos parecidos", () => {
        expect(isPublicPath("/clientes")).toBe(false)
        expect(isPublicPath("/api/clientes")).toBe(false)
        expect(resolveAuthAction("/cliente", true)).toBe("allow")
    })
})
