import { describe, expect, it } from "vitest"
import { appendBasePath, normalizeBasePath, withBasePath } from "@/lib/base-path"

describe("normalizeBasePath", () => {
    it("vazio ou só barras = app na raiz", () => {
        for (const raw of [undefined, null, "", "  ", "/", "//"]) expect(normalizeBasePath(raw), String(raw)).toBe("")
    })

    it("garante barra inicial e remove a final", () => {
        expect(normalizeBasePath("dev_automacao/tarefas-fernando/")).toBe("/dev_automacao/tarefas-fernando")
        expect(normalizeBasePath(" /tarefas ")).toBe("/tarefas")
    })
})

describe("withBasePath", () => {
    it("prefixa caminhos do app com o subcaminho público", () => {
        expect(withBasePath("/api/pusher/auth", "/dev_automacao/tarefas-fernando")).toBe("/dev_automacao/tarefas-fernando/api/pusher/auth")
        expect(withBasePath("api/x", "/p")).toBe("/p/api/x")
    })

    it("sem subcaminho mantém o caminho original", () => {
        expect(withBasePath("/api", "")).toBe("/api")
    })
})

describe("appendBasePath", () => {
    it("acrescenta o subcaminho à URL interna sem duplicar", () => {
        expect(appendBasePath("http://127.0.0.1:4500/", "/dev/tarefas")).toBe("http://127.0.0.1:4500/dev/tarefas")
        expect(appendBasePath("http://127.0.0.1:4500/dev/tarefas/", "/dev/tarefas")).toBe("http://127.0.0.1:4500/dev/tarefas")
        expect(appendBasePath("http://127.0.0.1:3100/", "")).toBe("http://127.0.0.1:3100")
    })
})
