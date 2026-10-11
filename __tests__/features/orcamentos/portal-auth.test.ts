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

    it("exige sessão para a prévia de tarefa do dono (páginas e APIs internas)", () => {
        for (const path of ["/tarefas/previa", "/tarefas/previa/abc", "/api/tasks/drafts", "/api/tasks/drafts/abc/estimate", "/api/tasks/drafts/abc/approve"]) {
            expect(isPublicPath(path)).toBe(false)
            expect(resolveAuthAction(path, false)).toBe(path.startsWith("/api") ? "unauthorized" : "redirect")
            expect(resolveAuthAction(path, true)).toBe("allow")
        }
    })
})
