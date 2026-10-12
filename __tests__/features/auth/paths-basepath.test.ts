import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/base-path", () => ({ BASE_PATH: "/dev_automacao/tarefas-fernando" }))

import { normalizePath, resolveAuthDecision } from "@/features/auth/paths"
import type { SessionPayload } from "@/features/auth/session"

const BASE = "/dev_automacao/tarefas-fernando"
const CLIENT: SessionPayload = { iat: 0, exp: 9_999_999_999, kind: "client", userId: "u1" }

describe("guarda de acesso com subcaminho público", () => {
    it("remove o basePath antes de decidir (o middleware pode entregar o caminho com o prefixo)", () => {
        expect(normalizePath(`${BASE}/tarefas`)).toBe("/tarefas")
        expect(normalizePath(BASE)).toBe("/")
        expect(resolveAuthDecision(`${BASE}/tarefas`, null)).toEqual({ action: "redirect", redirectTo: "/login" })
        expect(resolveAuthDecision(`${BASE}/login`, null).action).toBe("allow")
        expect(resolveAuthDecision(`${BASE}/api/tasks`, null).action).toBe("unauthorized")
        expect(resolveAuthDecision(`${BASE}/api/v1/whoami`, null).action).toBe("allow")
        expect(resolveAuthDecision(`${BASE}/cliente`, null).action).toBe("allow")
        expect(resolveAuthDecision(`${BASE}/cliente/dashboard`, CLIENT).action).toBe("allow")
    })
})
