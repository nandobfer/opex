import { describe, expect, it } from "vitest"
import type { IEnvironmentOperation } from "@/lib/db/models/EnvironmentOperation"
import { operationPrompt, shellQuote } from "@/features/environments/server/prompts"
import { DEFAULT_REPO_CONFIG } from "@/features/environments/schemas"
import { config, settings } from "./fixtures"

const access = {
    id: "op-1",
    dir: "/tmp/opex-environments/operation-op-1",
    baseUrl: "http://127.0.0.1:7001",
    token: "t".repeat(43),
}

const operation = (mode: "local" | "remote") =>
    ({
        kind: "inspect",
        method: "host",
        repo: "org/app",
        repoUrl: "https://github.com/org/app",
        environmentId: "bbbbbbbbbbbbbbbbbbbbbbbb",
        projectId: "aaaaaaaaaaaaaaaaaaaaaaaa",
        config,
        repoConfig: { ...DEFAULT_REPO_CONFIG, mode, host: "host", username: "deploy", hostKey: "host ssh-ed25519 key" },
        riskConfirmed: false,
    }) as unknown as IEnvironmentOperation

describe("prompt das operações de Ambientes", () => {
    it("manda o agente criar o diretório no host dele e buscar o envelope uma única vez", () => {
        const text = operationPrompt(operation("local"), access, settings)
        expect(text).toContain(access.dir)
        expect(text).toContain(`${access.baseUrl}/api/environments/agent-access`)
        expect(text).toContain(access.token)
        expect(text).toMatch(/busque o envelope UMA única vez/i)
        expect(text).toContain("variables.json")
        // Sem SSH no acesso local, e o gate manda falhar com código conhecido.
        expect(text).not.toContain("ssh.cjs")
        expect(text).toContain('OPEX_FAILURE {"code":"ACCESS_ENVELOPE_MISSING"}')
        expect(text).toContain("Execute ferramentas no host local do OpenCode")
        expect(text).toContain("OPEX_CHECKPOINT")
    })
    it("no acesso remoto usa o helper de SSH entregue pelo envelope", () => {
        const text = operationPrompt(operation("remote"), access, settings)
        expect(text).toContain(`${access.dir}/ssh.cjs`)
        expect(text).toContain("EXCLUSIVAMENTE pelo helper")
        expect(text).toContain("access.json")
    })
    it("shellQuote neutraliza aspas simples", () => {
        expect(shellQuote("a'b")).toBe("'a'\\''b'")
    })
})
