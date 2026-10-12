import { describe, expect, it } from "vitest"
import { isPublicPath, resolveAuthDecision } from "@/features/auth/paths"
import type { SessionPayload } from "@/features/auth/session"

const ADMIN: SessionPayload = { iat: 0, exp: 9_999_999_999, kind: "admin" }
const CLIENT: SessionPayload = { iat: 0, exp: 9_999_999_999, kind: "client", userId: "u1" }

describe("guarda de acesso do portal do cliente", () => {
    it("a entrada /cliente é pública (resolve o token e a escolha de cliente)", () => {
        expect(isPublicPath("/cliente")).toBe(true)
        expect(resolveAuthDecision("/cliente", null).action).toBe("allow")
    })

    it("as sub-rotas do portal exigem sessão (páginas redirecionam, APIs respondem 401)", () => {
        for (const path of ["/cliente/dashboard", "/cliente/tarefas", "/cliente/tarefa/abc"]) {
            expect(resolveAuthDecision(path, null)).toEqual({ action: "redirect", redirectTo: "/login" })
        }
        for (const path of ["/api/cliente", "/api/cliente/tasks", "/api/cliente/drafts/abc/preview"]) {
            expect(resolveAuthDecision(path, null)).toEqual({ action: "unauthorized" })
        }
    })

    it("a sessão de cliente acessa o portal e é barrada no app interno", () => {
        expect(resolveAuthDecision("/cliente/tarefas", CLIENT).action).toBe("allow")
        expect(resolveAuthDecision("/cliente", CLIENT).action).toBe("allow")
        expect(resolveAuthDecision("/tarefas/previa", CLIENT)).toEqual({ action: "redirect", redirectTo: "/cliente" })
        expect(resolveAuthDecision("/api/tasks/drafts", CLIENT).action).toBe("unauthorized")
    })

    it("não libera caminhos parecidos", () => {
        expect(isPublicPath("/clientes")).toBe(false)
        expect(isPublicPath("/api/clientes")).toBe(false)
    })

    it("exige sessão para a prévia de tarefa do dono (páginas e APIs internas)", () => {
        for (const path of ["/tarefas/previa", "/tarefas/previa/abc"]) {
            expect(isPublicPath(path)).toBe(false)
            expect(resolveAuthDecision(path, null)).toEqual({ action: "redirect", redirectTo: "/login" })
            expect(resolveAuthDecision(path, ADMIN).action).toBe("allow")
        }
        for (const path of ["/api/tasks/drafts", "/api/tasks/drafts/abc/estimate", "/api/tasks/drafts/abc/approve"]) {
            expect(resolveAuthDecision(path, null)).toEqual({ action: "unauthorized" })
            expect(resolveAuthDecision(path, ADMIN).action).toBe("allow")
        }
    })
})
