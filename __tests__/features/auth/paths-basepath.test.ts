import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/base-path", () => ({ BASE_PATH: "/dev_automacao/tarefas-fernando" }))

import { normalizePath, resolveAuthAction } from "@/features/auth/paths"

const BASE = "/dev_automacao/tarefas-fernando"

describe("guarda de acesso com subcaminho público", () => {
    it("remove o basePath antes de decidir (o middleware pode entregar o caminho com o prefixo)", () => {
        expect(normalizePath(`${BASE}/tarefas`)).toBe("/tarefas")
        expect(normalizePath(BASE)).toBe("/")
        expect(resolveAuthAction(`${BASE}/tarefas`, false)).toBe("redirect")
        expect(resolveAuthAction(`${BASE}/login`, false)).toBe("allow")
        expect(resolveAuthAction(`${BASE}/api/tasks`, false)).toBe("unauthorized")
        expect(resolveAuthAction(`${BASE}/api/v1/whoami`, false)).toBe("allow")
    })
})
