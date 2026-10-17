import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("@/lib/db", () => ({ dbConnect: async () => undefined }))
vi.mock("@/lib/db/models/Environment", async () => ({ Environment: (await import("./fixtures")).store.env }))
vi.mock("@/lib/db/models/EnvironmentRepoConfig", async () => ({
    EnvironmentRepoConfig: (await import("./fixtures")).store.repo,
}))
import {
    consumeAccessToken,
    grantAccess,
    readAccessSecrets,
    releaseAccess,
} from "@/features/environments/server/credentials"
import type { AccessGrantInput } from "@/features/environments/server/access-registry"
import { encryptSecret } from "@/lib/crypto/secretBox"
import { resetStore, settings, store, repoId, envId } from "./fixtures"

const REMOTE = {
    mode: "remote",
    auth: "password",
    host: "host",
    username: "deploy",
    port: 22,
    hostKey: "host ssh-ed25519 key",
    workflow: "",
} as const

const configured = { ...settings, agentBaseUrl: "http://127.0.0.1:7001" }
const context = (id: string, variables = settings.agent ? [] : []): AccessGrantInput => ({
    id,
    environmentId: envId,
    projectId: repoId,
    repoConfig: { ...store.repo.docs[0].config },
    variables: variables as AccessGrantInput["variables"],
})

beforeEach(() => {
    resetStore()
    process.env.INTEGRATIONS_ENCRYPTION_KEY = "test-environments"
    store.env.docs[0].secretVariables = encryptSecret(JSON.stringify({ TOKEN: "nao-expor-token" }))
})
afterEach(() => {
    vi.useRealTimers()
})

describe("acesso temporário por busca do agente", () => {
    it("entrega o envelope uma única vez, com escopo remoto e valores para censura", async () => {
        store.repo.docs[0].config = { ...REMOTE }
        store.repo.docs[0].secrets = encryptSecret(JSON.stringify({ password: "nao-expor" }))
        const grant = await grantAccess(context("op-a"), configured, "operation")
        expect(grant.dir).toBe(`/tmp/opex-environments/operation-op-a`)
        expect(grant.secretValues).toEqual(expect.arrayContaining(["nao-expor", "nao-expor-token"]))
        const payload = await consumeAccessToken("op-a", grant.token)
        expect(payload.repo).toMatchObject({ host: "host", username: "deploy", password: "nao-expor" })
        expect(payload.variables).toMatchObject({ TOKEN: "nao-expor-token" })
        expect(payload.helper).toContain("StrictHostKeyChecking=yes")
        expect(JSON.stringify(payload)).not.toContain(grant.token)
        await expect(consumeAccessToken("op-a", grant.token)).rejects.toMatchObject({ status: 409 })
        await expect(consumeAccessToken("op-a", "x".repeat(43))).rejects.toMatchObject({ status: 403 })
    })
    it("recusa sem credenciais remotas, expira no prazo e esquece ao encerrar", async () => {
        store.repo.docs[0].config = { ...REMOTE }
        await expect(grantAccess(context("op-b"), configured, "operation")).rejects.toThrow("Credenciais SSH ausentes")
        store.repo.docs[0].config = { ...store.repo.docs[0].config, mode: "local" }
        vi.useFakeTimers()
        const grant = await grantAccess(context("op-c"), { ...configured, accessTokenTtlMinutes: 5 }, "operation")
        vi.advanceTimersByTime(6 * 60_000)
        await expect(consumeAccessToken("op-c", grant.token)).rejects.toMatchObject({ status: 410 })
        vi.useRealTimers()
        const other = await grantAccess(context("op-d"), configured, "operation")
        releaseAccess("op-d")
        await expect(consumeAccessToken("op-d", other.token)).rejects.toMatchObject({ status: 403 })
    })
    it("acesso local não carrega destino SSH e a sessão de logs não recebe variáveis", async () => {
        const local = await grantAccess(context("op-e"), configured, "operation")
        const payload = await consumeAccessToken("op-e", local.token)
        expect(payload.repo).toBeNull()
        expect(payload.helper).toBeNull()
        expect(payload.variables).toMatchObject({ TOKEN: "nao-expor-token" })
        const logs = await grantAccess({ ...context("logs-a"), variables: null }, configured, "logs")
        expect(await consumeAccessToken("logs-a", logs.token)).toMatchObject({ variables: null })
        expect(await readAccessSecrets(context("op-f"))).toEqual(expect.arrayContaining(["nao-expor-token"]))
    })
    it("a operação exige URL base do agente configurada", async () => {
        await expect(
            grantAccess(context("op-g"), { ...settings, agentBaseUrl: "" }, "operation"),
        ).rejects.toMatchObject({ status: 409 })
    })
})
