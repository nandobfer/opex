import { beforeEach, describe, expect, it, vi } from "vitest"
import type { TurnHooks, TurnRequest, TurnResult } from "@/lib/ai/opencode-run"
const mocks = vi.hoisted(() => ({
    run: vi.fn<(client: unknown, request: TurnRequest, hooks?: TurnHooks) => Promise<TurnResult>>(),
    probe: vi.fn(),
    create: vi.fn(),
    cleanup: vi.fn(),
    access: vi.fn(),
    interrupt: vi.fn(),
    dispatch: vi.fn(),
}))
vi.mock("@/lib/db", () => ({ dbConnect: vi.fn() }))
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }))
vi.mock("@/lib/audit/record", () => ({ recordAudit: vi.fn(), AcaoAuditoria: { ATUALIZAR: "ATUALIZAR" } }))
vi.mock("@/features/environments/server/events", () => ({ publishEnvironment: vi.fn() }))
vi.mock("@/features/environments/server/queue", () => ({ pumpEnvironments: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/features/environments/server/github", () => ({ dispatchAndWatch: mocks.dispatch }))
vi.mock("@/features/environments/server/credentials", () => ({
    provisionAccess: mocks.access,
    removeAccess: mocks.cleanup,
}))
vi.mock("@/features/ai/server/settings", async () => ({
    loadEnvironmentSettings: async () => ({ settings: (await import("./fixtures")).settings }),
}))
vi.mock("@/lib/ai/opencode-client", () => ({
    getOpencodeClient: async () => ({
        session: { create: mocks.create, interrupt: mocks.interrupt, form: { cancel: vi.fn() } },
        permission: { reply: vi.fn() },
    }),
}))
vi.mock("@/lib/ai/opencode-run", () => ({ runAgentTurn: mocks.run, probeAttachSession: mocks.probe }))
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
vi.mock("@/lib/db/models/EnvironmentDeployment", async () => ({
    EnvironmentDeployment: (await import("./fixtures")).store.deployment,
}))
vi.mock("@/lib/db/models/IntegrationLog", async () => ({ IntegrationLog: (await import("./fixtures")).store.log }))
import { executeEnvironment } from "@/features/environments/server/runner"
import { resetStore, seedOperation, store, opId, observed, imageId, envId } from "./fixtures"
const success = (value = observed): TurnResult => ({
    outcome: "succeeded",
    text: JSON.stringify(value),
    message: null,
    costUsd: 0,
    durationMs: 1,
})

beforeEach(() => {
    vi.clearAllMocks()
    resetStore()
    seedOperation()
    mocks.create.mockResolvedValue({ id: "session" })
    mocks.run.mockResolvedValue(success())
    mocks.cleanup.mockResolvedValue(undefined)
    mocks.access.mockResolvedValue({
        dir: "/tmp/opencode/access/operation-test",
        secretValues: ["segredo-privado"],
        cleanup: mocks.cleanup,
    })
})
describe("executor por agentes e recuperação conservadora", () => {
    it("restauração multissserviço exige comprovar o conjunto inteiro por ID imutável", async () => {
        const images = [
            ...observed.images,
            { ...observed.images[0], service: "worker", imageId: `sha256:${"b".repeat(64)}` },
        ]
        store.op.docs[0].kind = "restore"
        store.op.docs[0].imageId = imageId
        store.image.docs.push({ _id: imageId, environmentId: envId, dbVersion: "m002", images })
        await executeEnvironment(opId)
        expect(store.op.docs[0].state).toBe("reconciling")
        expect(mocks.run.mock.calls[1][1].text).toContain(images[1].imageId)
        resetStore()
        seedOperation({ kind: "restore", imageId })
        store.image.docs.push({ _id: imageId, environmentId: envId, dbVersion: "m002", images })
        mocks.run.mockResolvedValueOnce(success()).mockResolvedValueOnce(success({ ...observed, images }))
        await executeEnvironment(opId)
        expect(store.op.docs[0].state).toBe("succeeded")
    })
    it("faz preflight, preserva imagens anteriores e conclui só com evidência", async () => {
        await executeEnvironment(opId)
        expect(mocks.run).toHaveBeenCalledTimes(2)
        expect(mocks.run.mock.calls[0][1].text).toContain("EXCLUSIVAMENTE a operação inspect")
        expect(mocks.run.mock.calls[1][1].text).toContain("EXCLUSIVAMENTE a operação publish")
        expect(store.image.docs).toHaveLength(2)
        expect(store.op.docs[0]).toMatchObject({ state: "succeeded", sessionId: "session" })
        expect(store.env.docs[0].activeOperationId).toBeNull()
        expect(mocks.cleanup).toHaveBeenCalled()
    })
    it("saúde ruim produz degradado, sem turno de rollback", async () => {
        mocks.run.mockResolvedValueOnce(success()).mockResolvedValueOnce(success({ ...observed, healthy: false }))
        await executeEnvironment(opId)
        expect(store.op.docs[0].state).toBe("degraded")
        expect(mocks.run).toHaveBeenCalledTimes(2)
    })
    it("falha de build mantém reserva até inspeção e não inventa versão", async () => {
        mocks.run
            .mockResolvedValueOnce(success())
            .mockResolvedValueOnce({ ...success(), outcome: "failed", text: "Disco cheio" })
        await executeEnvironment(opId)
        expect(store.op.docs[0].state).toBe("reconciling")
        expect(store.env.docs[0].activeOperationId).toBe(opId)
        expect(store.image.docs).toHaveLength(1)
    })
    it("checkpoint de migração fica gravado mesmo se uma etapa posterior falhar", async () => {
        mocks.run.mockResolvedValueOnce(success()).mockImplementationOnce(async (_client, _request, hooks) => {
            await hooks?.onText?.(
                `OPEX_CHECKPOINT ${JSON.stringify({ stage: "Migração aplicada segredo-privado", dbVersion: "m003", databaseCertain: true, migrations: ["m003"], evidence: ["Migração m003 aplicada; segredo-privado"] })}\n`,
            )
            return { ...success(), outcome: "failed", text: "Falhou após migração" }
        })
        await executeEnvironment(opId)
        expect(store.env.docs[0].dbVersion).toBe("m003")
        expect(JSON.stringify(store.deployment.docs)).toContain("m003")
        expect(JSON.stringify(store.deployment.docs)).not.toContain("segredo-privado")
        expect(JSON.stringify(store.op.docs)).not.toContain("segredo-privado")
    })
    it("banco mudou no host: restauração é bloqueada antes do turno mutante", async () => {
        store.op.docs[0].kind = "restore"
        store.op.docs[0].imageId = imageId
        store.image.docs.push({ _id: imageId, environmentId: envId, dbVersion: "m001", images: observed.images })
        await executeEnvironment(opId)
        expect(mocks.run).toHaveBeenCalledTimes(1)
        expect(store.op.docs[0].state).toBe("failed")
        expect(store.env.docs[0].activeOperationId).toBeNull()
    })
    it("restauração usa IDs imutáveis, banco alvo e proíbe build/pull", async () => {
        store.op.docs[0].kind = "restore"
        store.op.docs[0].imageId = imageId
        store.image.docs.push({ _id: imageId, environmentId: envId, dbVersion: "m002", images: observed.images })
        await executeEnvironment(opId)
        const prompt = mocks.run.mock.calls[1][1].text
        expect(prompt).toContain('"targetDbVersion":"m002"')
        expect(prompt).toContain(observed.images[0].imageId)
        expect(prompt).toContain("--no-build --pull never")
    })
    it("reinício após preflight não o confunde com publicação concluída", async () => {
        store.op.docs[0].sessionId = "old-session"
        store.op.docs[0].phase = "preflight"
        mocks.probe.mockResolvedValue({ kind: "finished", outcome: "succeeded" })
        await executeEnvironment(opId, true)
        expect(mocks.run).toHaveBeenCalledTimes(1)
        expect(mocks.run.mock.calls[0][1].attach).toBe(false)
        expect(mocks.run.mock.calls[0][1].text).toContain("RECONCILIAÇÃO: NÃO repita")
        expect(store.op.docs[0].state).toBe("interrupted")
    })
    it("reconecta ação existente sem novo deploy e bloqueia se OpenCode indisponível", async () => {
        store.op.docs[0].sessionId = "old-session"
        store.op.docs[0].phase = "action"
        mocks.probe.mockResolvedValue({ kind: "running" })
        await executeEnvironment(opId, true)
        expect(mocks.create).not.toHaveBeenCalled()
        expect(mocks.run.mock.calls[0][1].attach).toBe(true)
        resetStore()
        seedOperation({ sessionId: "old-session", phase: "action", accessPath: "/tmp/opencode/access/operation-old" })
        mocks.probe.mockResolvedValue({ kind: "unavailable" })
        mocks.cleanup.mockClear()
        await executeEnvironment(opId, true)
        expect(store.env.docs[0].activeOperationId).toBe(opId)
        expect(mocks.cleanup).not.toHaveBeenCalled()
    })
    it("reconciliação não libera host com processo de publicação ainda ativo", async () => {
        mocks.run.mockResolvedValue(success({ ...observed, quiescent: false }))
        await executeEnvironment(opId, true)
        expect(store.op.docs[0].state).toBe("reconciling")
        expect(store.env.docs[0].activeOperationId).toBe(opId)
    })
    it("CD só verifica o host depois do run e nunca usa build local", async () => {
        store.op.docs[0].method = "cd"
        mocks.dispatch.mockResolvedValue({
            runId: 42,
            runUrl: "https://github.com/run/42",
            sha: "abc",
            conclusion: "success",
        })
        await executeEnvironment(opId)
        expect(mocks.dispatch).toHaveBeenCalledTimes(1)
        expect(mocks.run).toHaveBeenCalledTimes(1)
        expect(mocks.run.mock.calls[0][1].text).toContain("CD esperado")
    })
})
