import { describe, expect, it } from "vitest"
import { isApiPath, isPublicPath, normalizePath, resolveAuthAction } from "@/features/auth/paths"

describe("guarda de acesso", () => {
    it("libera as rotas públicas sem sessão", () => {
        for (const path of ["/login", "/api/auth/login", "/api/auth/logout", "/api/v1/whoami", "/api/routines/scheduler-tick"]) {
            expect(resolveAuthAction(path, false)).toBe("allow")
        }
    })

    it("sem sessão: página redireciona e API interna responde 401", () => {
        expect(resolveAuthAction("/tarefas", false)).toBe("redirect")
        expect(resolveAuthAction("/integracoes", false)).toBe("redirect")
        expect(resolveAuthAction("/api/tasks", false)).toBe("unauthorized")
        expect(resolveAuthAction("/api/pusher/auth", false)).toBe("unauthorized")
    })

    it("com sessão libera páginas e APIs", () => {
        expect(resolveAuthAction("/tarefas", true)).toBe("allow")
        expect(resolveAuthAction("/api/tasks", true)).toBe("allow")
    })

    it("normaliza barras e identifica API/público", () => {
        expect(normalizePath("/tarefas/")).toBe("/tarefas")
        expect(normalizePath("/")).toBe("/")
        expect(isApiPath("/api/tasks")).toBe(true)
        expect(isApiPath("/tarefas")).toBe(false)
        expect(isPublicPath("/login")).toBe(true)
        expect(isPublicPath("/tarefas")).toBe(false)
    })
})
