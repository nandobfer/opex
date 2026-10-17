import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { mkdtemp, readFile, stat, rm, chmod } from "node:fs/promises"
import type { IEnvironmentOperation } from "@/lib/db/models/EnvironmentOperation"
vi.mock("@/lib/db/models/Environment", async () => ({ Environment: (await import("./fixtures")).store.env }))
vi.mock("@/lib/db/models/EnvironmentRepoConfig", async () => ({
    EnvironmentRepoConfig: (await import("./fixtures")).store.repo,
}))
import { provisionAccess, removeAccess } from "@/features/environments/server/credentials"
import { encryptSecret } from "@/lib/crypto/secretBox"
import { resetStore, store, seedOperation } from "./fixtures"

let root = ""
beforeEach(async () => {
    resetStore()
    seedOperation()
    process.env.INTEGRATIONS_ENCRYPTION_KEY = "test-environments"
    root = await mkdtemp("/tmp/opencode/ope-67-credentials-")
})
afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true })
})
describe("acesso temporário protegido", () => {
    it("provisiona pasta 0700/arquivos 0600 sem segredo nos argumentos e remove no término", async () => {
        store.op.docs[0].repoConfig = {
            mode: "remote",
            auth: "password",
            host: "host",
            username: "deploy",
            port: 22,
            hostKey: "host ssh-ed25519 key",
        }
        store.repo.docs[0].secrets = encryptSecret(JSON.stringify({ password: "nao-expor" }))
        store.env.docs[0].secretVariables = encryptSecret(JSON.stringify({ TOKEN: "nao-expor-token" }))
        const access = await provisionAccess(store.op.docs[0] as unknown as IEnvironmentOperation, root)
        expect((await stat(access.dir)).mode & 0o777).toBe(0o700)
        expect((await stat(access.dir + "/access.json")).mode & 0o777).toBe(0o600)
        const helper = await readFile(access.dir + "/ssh.cjs", "utf8")
        expect(helper).not.toContain("nao-expor")
        expect(helper).toContain("StrictHostKeyChecking=yes")
        expect(helper).toContain("SSH_ASKPASS_REQUIRE:'force'")
        expect(await readFile(access.dir + "/variables.json", "utf8")).toContain("nao-expor-token")
        await access.cleanup()
        await expect(stat(access.dir)).rejects.toMatchObject({ code: "ENOENT" })
    })
    it("recusa raiz aberta, ausência de credenciais e limpeza fora do escopo", async () => {
        await chmod(root, 0o755)
        await expect(provisionAccess(store.op.docs[0] as unknown as IEnvironmentOperation, root)).rejects.toThrow(
            "0700",
        )
        await chmod(root, 0o700)
        store.op.docs[0].repoConfig = { mode: "remote", auth: "key" }
        await expect(provisionAccess(store.op.docs[0] as unknown as IEnvironmentOperation, root)).rejects.toThrow(
            "Credenciais SSH ausentes",
        )
        await expect(removeAccess(root, root)).rejects.toThrow("fora do escopo")
        expect((await stat(root)).isDirectory()).toBe(true)
    })
})
