import { describe, expect, it } from "vitest"
import { isApiPath, isClientPath, isPublicPath, normalizePath, resolveAuthDecision } from "@/features/auth/paths"
import type { SessionPayload } from "@/features/auth/session"

const ADMIN: SessionPayload = { iat: 0, exp: 9_999_999_999, kind: "admin" }
const CLIENT: SessionPayload = { iat: 0, exp: 9_999_999_999, kind: "client", userId: "u1" }

describe("guarda de acesso", () => {
    it("libera as rotas públicas sem sessão", () => {
        for (const path of ["/login", "/api/auth/login", "/api/auth/logout", "/api/auth/client-login", "/cliente", "/api/v1/whoami", "/api/routines/scheduler-tick"]) {
            expect(isPublicPath(path)).toBe(true)
            expect(resolveAuthDecision(path, null).action).toBe("allow")
        }
    })

    it("libera a documentação OpenAPI da API interna sem sessão (teste da integração)", () => {
        for (const path of ["/api/openapi.json", "/api/docs"]) {
            expect(isPublicPath(path)).toBe(true)
            expect(resolveAuthDecision(path, null).action).toBe("allow")
        }
    })

    it("a documentação liberada não abre as APIs internas vizinhas", () => {
        for (const path of ["/api/integrations/internal_api", "/api/ai/providers/opencode/usage", "/api/openapi", "/api/docs/private"]) {
            expect(resolveAuthDecision(path, null).action).toBe("unauthorized")
        }
    })

    it("sem sessão: página redireciona para /login e API interna responde 401", () => {
        expect(resolveAuthDecision("/tarefas", null)).toEqual({ action: "redirect", redirectTo: "/login" })
        expect(resolveAuthDecision("/api/tasks", null).action).toBe("unauthorized")
        expect(resolveAuthDecision("/api/pusher/auth", null).action).toBe("unauthorized")
    })

    it("o dono passa em tudo (app e portal)", () => {
        for (const path of ["/tarefas", "/api/tasks", "/cliente/dashboard", "/api/cliente/tasks", "/cliente/usuarios"]) {
            expect(resolveAuthDecision(path, ADMIN).action).toBe("allow")
        }
    })

    it("o usuário de cliente só acessa o portal", () => {
        for (const path of ["/cliente/dashboard", "/cliente/tarefas", "/cliente/tarefa/1", "/api/cliente/tasks", "/api/cliente/usuarios"]) {
            expect(resolveAuthDecision(path, CLIENT).action).toBe("allow")
        }
        expect(resolveAuthDecision("/tarefas", CLIENT)).toEqual({ action: "redirect", redirectTo: "/cliente" })
        expect(resolveAuthDecision("/integracoes", CLIENT)).toEqual({ action: "redirect", redirectTo: "/cliente" })
        expect(resolveAuthDecision("/api/tasks", CLIENT).action).toBe("unauthorized")
        expect(resolveAuthDecision("/api/financeiro", CLIENT).action).toBe("unauthorized")
    })

    it("a sessão de cliente alcança as rotas de auth internas e o auth do Pusher", () => {
        expect(resolveAuthDecision("/api/auth/client-select", CLIENT).action).toBe("allow")
        expect(resolveAuthDecision("/api/pusher/auth", CLIENT).action).toBe("allow")
        // Sem sessão, continuam protegidas.
        expect(resolveAuthDecision("/api/auth/client-select", null).action).toBe("unauthorized")
        expect(resolveAuthDecision("/api/pusher/auth", null).action).toBe("unauthorized")
    })

    it("normaliza barras e identifica API/público/cliente", () => {
        expect(normalizePath("/tarefas/")).toBe("/tarefas")
        expect(normalizePath("/")).toBe("/")
        expect(isApiPath("/api/tasks")).toBe(true)
        expect(isApiPath("/tarefas")).toBe(false)
        expect(isPublicPath("/tarefas")).toBe(false)
        expect(isClientPath("/cliente/dashboard")).toBe(true)
        expect(isClientPath("/clientes")).toBe(false)
        expect(isClientPath("/api/cliente/tasks")).toBe(true)
        expect(isClientPath("/api/clientes")).toBe(false)
    })
})
