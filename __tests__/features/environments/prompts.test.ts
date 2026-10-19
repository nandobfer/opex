import { describe, expect, it } from "vitest"
import type { IEnvironmentOperation } from "@/lib/db/models/EnvironmentOperation"
import { dbVersionPrompt, operationPrompt } from "@/features/environments/server/prompts"
import { shellQuote, type HostInspection } from "@/features/environments/server/host"
import { DEFAULT_REPO_CONFIG } from "@/features/environments/schemas"
import { config, settings, observed } from "./fixtures"

const dir = "/tmp/opex-environments/operation-op-1"
const operation = (mode: "local" | "remote", kind = "publish") =>
    ({
        kind,
        method: "host",
        repo: "org/app",
        repoUrl: "https://github.com/org/app",
        environmentId: "bbbbbbbbbbbbbbbbbbbbbbbb",
        projectId: "aaaaaaaaaaaaaaaaaaaaaaaa",
        config,
        repoConfig: { ...DEFAULT_REPO_CONFIG, mode, host: "host", username: "deploy", hostKey: "host ssh-ed25519 key" },
        riskConfirmed: false,
    }) as unknown as IEnvironmentOperation
const facts: HostInspection = {
    compose: observed.compose,
    images: observed.images,
    containers: [{ service: "app", id: "c1", state: "running", health: null }],
    healthy: true,
    quiescent: true,
    evidence: [],
}

describe("prompts dos agentes de Ambientes", () => {
    it("o acesso já existe no host: o agente só o usa, sem buscar nem recriar", () => {
        const text = operationPrompt(operation("local"), dir, settings, null)
        expect(text).toContain(`O Opex já gravou o acesso temporário protegido em '${dir}'`)
        expect(text).not.toMatch(/curl|agent-access|envelope/i)
        expect(text).not.toContain("ssh.cjs")
        expect(text).toContain("EXCLUSIVAMENTE a operação publish")
        expect(text).toContain("OPEX_CHECKPOINT")
    })
    it("remoto usa o helper SSH e restauração proíbe build/pull", () => {
        const text = operationPrompt(operation("remote", "restore"), dir, settings, null, observed.images, false, "m002")
        expect(text).toContain(`${dir}/ssh.cjs`)
        expect(text).toContain("--no-build --pull never")
        expect(text).toContain('"targetDbVersion":"m002"')
    })
    it("turno de versão do banco é somente leitura e recebe o estado já lido", () => {
        const text = dbVersionPrompt(operation("local", "inspect"), dir, settings, facts)
        expect(text).toContain("SOMENTE LEITURA")
        expect(text).toContain(observed.images[0].imageId)
        expect(text).toContain('"dbVersion":null,"databaseCertain":false')
    })
    it("shellQuote neutraliza aspas simples", () => {
        expect(shellQuote("a'b")).toBe("'a'\\''b'")
    })
})
