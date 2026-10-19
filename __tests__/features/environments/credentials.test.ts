import { beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("@/lib/db", () => ({ dbConnect: async () => undefined }))
vi.mock("@/lib/db/models/Environment", async () => ({ Environment: (await import("./fixtures")).store.env }))
vi.mock("@/lib/db/models/EnvironmentRepoConfig", async () => ({
    EnvironmentRepoConfig: (await import("./fixtures")).store.repo,
}))
import { buildAccessFiles, readAccessSecrets, type AccessScope } from "@/features/environments/server/credentials"
import { encryptSecret } from "@/lib/crypto/secretBox"
import { resetStore, store, repoId, envId } from "./fixtures"

const REMOTE = {
    mode: "remote",
    auth: "password",
    host: "host",
    username: "deploy",
    port: 22,
    hostKey: "host ssh-ed25519 key",
    workflow: "",
} as const
const dir = "/tmp/opex-environments/operation-op"
const scope = (overrides: Partial<AccessScope> = {}): AccessScope => ({
    environmentId: envId,
    projectId: repoId,
    repoConfig: { ...store.repo.docs[0].config },
    variables: [
        { name: "PUBLICA", value: "1", secret: false },
        { name: "TOKEN", value: "", secret: true },
    ],
    ...overrides,
})

beforeEach(() => {
    resetStore()
    process.env.INTEGRATIONS_ENCRYPTION_KEY = "test-environments"
    store.env.docs[0].secretVariables = encryptSecret(JSON.stringify({ TOKEN: "nao-expor-token" }))
})

describe("conteúdo do acesso temporário (gravado no host pelo shell)", () => {
    it("acesso local só leva as variáveis, públicas e secretas", async () => {
        const { files, secretValues } = await buildAccessFiles(scope(), dir)
        expect(Object.keys(files)).toEqual(["variables.json"])
        expect(JSON.parse(files["variables.json"].content)).toEqual({ PUBLICA: "1", TOKEN: "nao-expor-token" })
        expect(files["variables.json"].mode).toBe(0o600)
        expect(secretValues).toEqual(["nao-expor-token"])
    })
    it("acesso remoto inclui destino, known_hosts e helper SSH sem segredo no helper", async () => {
        store.repo.docs[0].secrets = encryptSecret(JSON.stringify({ password: "nao-expor" }))
        const { files, secretValues } = await buildAccessFiles(scope({ repoConfig: { ...REMOTE } }), dir, 0)
        expect(Object.keys(files).sort()).toEqual(["access.json", "askpass", "known_hosts", "ssh.cjs", "variables.json"])
        expect(JSON.parse(files["access.json"].content)).toMatchObject({ host: "host", password: "nao-expor", expiresAt: 5 * 60 * 60_000 })
        expect(files["ssh.cjs"].content).toContain("StrictHostKeyChecking=yes")
        expect(files["ssh.cjs"].content).not.toContain("nao-expor")
        expect(files["ssh.cjs"].mode).toBe(0o700)
        expect(files.askpass.content).toContain(`${dir}/ssh.cjs`)
        expect(secretValues).toEqual(expect.arrayContaining(["nao-expor", "nao-expor-token"]))
    })
    it("logs não recebem variáveis e remoto sem credencial é recusado", async () => {
        expect((await buildAccessFiles(scope({ variables: null }), dir)).files).toEqual({})
        await expect(buildAccessFiles(scope({ repoConfig: { ...REMOTE } }), dir)).rejects.toThrow("Credenciais SSH ausentes")
        expect(await readAccessSecrets(scope())).toEqual(["nao-expor-token"])
    })
})
