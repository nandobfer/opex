import { describe, expect, it, vi } from "vitest"

vi.mock("@/features/github/client", () => ({
    githubRequestFull: vi.fn(),
    GithubError: class GithubError extends Error {
        constructor(message: string, readonly code = "UNKNOWN", readonly status = 0) {
            super(message)
        }
    },
}))

import { composeConflicts, parseComposeContent } from "@/features/environments/server/compose"
import { stepsFor } from "@/features/environments/server/operations"

describe("compose — interpretação do YAML", () => {
    it("interpreta um compose válido", () => {
        const summary = parseComposeContent("services:\n  app:\n    image: opex:latest\n    ports:\n      - '3000:3000'\n", "docker-compose.yml")
        expect(summary.services).toHaveLength(1)
        expect(summary.services[0]).toMatchObject({ name: "app", image: "opex:latest" })
    })

    it("YAML inválido vira erro de regra", () => {
        expect(() => parseComposeContent("services: [unclosed")).toThrowError(/YAML/i)
    })

    it("composeConflicts aponta container_name", () => {
        const conflicts = composeConflicts("services:\n  app:\n    container_name: fixo\n")
        expect(conflicts.join(" ")).toContain("container_name")
    })
})

describe("operations — etapas por tipo", () => {
    it("publicação local tem 4 etapas + compatibilidade do banco", () => {
        const steps = stepsFor("publish", "local")
        expect(steps.map((step) => step.id)).toEqual(["git", "build", "up", "compat", "healthcheck"])
        expect(steps.every((step) => step.status === "pending")).toBe(true)
    })

    it("publicação pelo CD tem 2 etapas", () => {
        expect(stepsFor("publish", "cd").map((step) => step.id)).toEqual(["dispatch", "watch"])
    })

    it("restauração tem 2 etapas", () => {
        expect(stepsFor("restore", null).map((step) => step.id)).toEqual(["check", "up"])
    })
})
