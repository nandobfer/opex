import { beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ audit: vi.fn(), event: vi.fn() }))
vi.mock("@/lib/db", () => ({ dbConnect: vi.fn() }))
vi.mock("@/lib/audit/record", () => ({
    recordAudit: mocks.audit,
    AcaoAuditoria: { CRIAR: "CRIAR", ATUALIZAR: "ATUALIZAR" },
}))
vi.mock("@/features/environments/server/events", () => ({ publishEnvironment: mocks.event }))
vi.mock("@/lib/db/models/Project", async () => ({ Project: (await import("./fixtures")).store.project }))
vi.mock("@/lib/db/models/Environment", async () => ({ Environment: (await import("./fixtures")).store.env }))
vi.mock("@/lib/db/models/EnvironmentRepoConfig", async () => ({
    EnvironmentRepoConfig: (await import("./fixtures")).store.repo,
}))
vi.mock("@/lib/db/models/EnvironmentOperation", async () => ({
    EnvironmentOperation: (await import("./fixtures")).store.op,
}))
vi.mock("@/lib/db/models/EnvironmentImage", async () => ({
    EnvironmentImage: (await import("./fixtures")).store.image,
}))
import {
    saveEnvironment,
    getRepoConfig,
    saveRepoConfig,
    saveSshSecrets,
    environmentDetail,
} from "@/features/environments/server/service"
import { decryptSecret, encryptSecret, type EncryptedSecret } from "@/lib/crypto/secretBox"
import { resetStore, store, repoId, envId, config } from "./fixtures"
import { DEFAULT_REPO_CONFIG } from "@/features/environments/schemas"
const owner = { userId: "local", clientId: null, projectIds: null, canEdit: true, owner: true }
const admin = { ...owner, userId: "user", clientId: "client", projectIds: [repoId], owner: false }

beforeEach(() => {
    vi.clearAllMocks()
    resetStore()
    process.env.INTEGRATIONS_ENCRYPTION_KEY = "test-environments"
})
describe("configuração e segredos de Ambientes", () => {
    it("cifra variável privada sem devolver valor nem auditar segredos", async () => {
        const saved = await saveEnvironment(
            owner,
            repoId,
            { ...config, variables: [{ name: "TOKEN", value: "nao-vazar", secret: true }] },
            envId,
            0,
        )
        expect(saved.variables).toEqual([{ name: "TOKEN", value: "", secret: true }])
        expect(JSON.stringify(store.env.docs[0])).not.toContain("nao-vazar")
        expect(decryptSecret(store.env.docs[0].secretVariables as EncryptedSecret)).toContain("nao-vazar")
        expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("nao-vazar")
        expect(mocks.event).toHaveBeenCalledWith(repoId, envId)
    })
    it("valor vazio preserva segredo; admin não pode substituir, renomear ou remover", async () => {
        store.env.docs[0].config = { ...config, variables: [{ name: "TOKEN", value: "", secret: true }] }
        store.env.docs[0].secretVariables = encryptSecret(JSON.stringify({ TOKEN: "original" }))
        await saveEnvironment(
            admin,
            repoId,
            { ...config, name: "Homologação", variables: [{ name: "TOKEN", value: "", secret: true }] },
            envId,
            0,
        )
        expect(decryptSecret(store.env.docs[0].secretVariables as EncryptedSecret)).toContain("original")
        await expect(
            saveEnvironment(
                admin,
                repoId,
                { ...config, variables: [{ name: "TOKEN", value: "novo", secret: true }] },
                envId,
                1,
            ),
        ).rejects.toMatchObject({ status: 403 })
        await expect(saveEnvironment(admin, repoId, { ...config, variables: [] }, envId, 1)).rejects.toMatchObject({
            status: 403,
        })
    })
    it("bloqueia revisão desatualizada, alteração de slug e ambiente ocupado", async () => {
        await expect(saveEnvironment(owner, repoId, config, envId, 2)).rejects.toMatchObject({ status: 409 })
        await expect(saveEnvironment(owner, repoId, { ...config, slug: "outro" }, envId, 0)).rejects.toMatchObject({
            status: 409,
        })
        store.env.docs[0].activeOperationId = "op"
        await expect(saveEnvironment(owner, repoId, config, envId, 0)).rejects.toMatchObject({ status: 409 })
    })
    it("admin altera workflow mas nunca redireciona acesso SSH salvo", async () => {
        await saveRepoConfig(admin, repoId, { ...DEFAULT_REPO_CONFIG, workflow: "deploy.yml" }, 0)
        expect(store.repo.docs[0].revision).toBe(1)
        await expect(
            saveRepoConfig(admin, repoId, { ...DEFAULT_REPO_CONFIG, host: "atacante" }, 1),
        ).rejects.toMatchObject({ status: 403 })
    })
    it("SSH apenas substituível pelo dono e DTO só indica configuração", async () => {
        await saveSshSecrets(owner, repoId, { password: "privado" })
        expect(await getRepoConfig(owner, repoId)).toMatchObject({ secretsConfigured: true })
        expect(JSON.stringify(await getRepoConfig(owner, repoId))).not.toContain("privado")
        await expect(saveSshSecrets(admin, repoId, { password: "roubo" })).rejects.toMatchObject({ status: 403 })
    })
    it("operação ativa impede trocar host ou credenciais", async () => {
        store.op.docs.push({ projectId: repoId, state: "queued" })
        await expect(saveRepoConfig(owner, repoId, DEFAULT_REPO_CONFIG, 0)).rejects.toMatchObject({ status: 409 })
        await expect(saveSshSecrets(owner, repoId, { password: "senha" })).rejects.toMatchObject({ status: 409 })
    })
    it("usuário comum não configura e não recebe sessão OpenCode no histórico", async () => {
        const user = { ...admin, canEdit: false }
        await expect(saveEnvironment(user, repoId, config, envId, 0)).rejects.toMatchObject({ status: 403 })
        store.op.docs.push({
            _id: "o",
            environmentId: envId,
            sessionId: "sessao-interna",
            kind: "inspect",
            state: "succeeded",
            stage: "Concluído",
            createdAt: new Date(),
            finishedAt: new Date(),
            evidence: [],
            migrations: [],
            runUrl: null,
        })
        const detail = await environmentDetail(user, repoId, envId)
        expect(detail.operations[0].sessionId).toBeNull()
        expect(detail.canEdit).toBe(false)
    })
})
