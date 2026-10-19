import { beforeEach, describe, expect, it, vi } from "vitest"
import type { TurnHooks, TurnRequest, TurnResult } from "@/lib/ai/opencode-run"
import type { HostInspection } from "@/features/environments/server/host"
const mocks = vi.hoisted(() => ({
    run: vi.fn<(client: unknown, request: TurnRequest, hooks?: TurnHooks) => Promise<TurnResult>>(),
    probe: vi.fn(),
    create: vi.fn(),
    interrupt: vi.fn(),
    dispatch: vi.fn(),
    inspect: vi.fn(),
    write: vi.fn(),
    remove: vi.fn(),
    has: vi.fn(),
}))
vi.mock("@/lib/db", () => ({ dbConnect: vi.fn() }))
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }))
vi.mock("@/lib/audit/record", () => ({ recordAudit: vi.fn(), AcaoAuditoria: { ATUALIZAR: "ATUALIZAR" } }))
vi.mock("@/features/environments/server/events", () => ({ publishEnvironment: vi.fn() }))
vi.mock("@/features/environments/server/queue", () => ({ pumpEnvironments: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/features/environments/server/github", () => ({ dispatchAndWatch: mocks.dispatch }))
vi.mock("@/features/environments/server/credentials", () => ({
    readAccessSecrets: async () => ["segredo-privado"],
}))
vi.mock("@/features/environments/server/host", async (original) => ({
    ...(await original<typeof import("@/features/environments/server/host")>()),
    inspectHost: mocks.inspect,
    writeAccess: mocks.write,
    removeAccess: mocks.remove,
    hasAccess: mocks.has,
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
import { HostError } from "@/features/environments/server/host"
import { resetStore, seedOperation, store, opId, observed, imageId, envId } from "./fixtures"

const FENCE = String.fromCharCode(96).repeat(3)
const success = (value: unknown = observed): TurnResult => ({
    outcome: "succeeded",
    text: `${FENCE}json\n${JSON.stringify(value)}\n${FENCE}`,
    message: null,
    costUsd: 0,
    durationMs: 1,
})
const db = (dbVersion: string | null) =>
    success({ dbVersion, databaseCertain: dbVersion !== null, migrations: dbVersion ? [dbVersion] : [], evidence: ["migrações lidas"] })
const facts = (overrides: Partial<HostInspection> = {}): HostInspection => ({
    compose: observed.compose,
    images: observed.images,
    containers: [{ service: "app", id: "c1", state: "running", health: "healthy" }],
    healthy: true,
    quiescent: true,
    evidence: ["Compose efetivo lido no host: 1 serviço(s) (app)."],
    ...overrides,
})
const prompts = () => mocks.run.mock.calls.map((call) => call[1])
const accessDir = `/tmp/opex-environments/operation-${opId}`

beforeEach(() => {
    vi.clearAllMocks()
    resetStore()
    seedOperation()
    mocks.create.mockResolvedValue({ id: "session" })
    mocks.run.mockResolvedValue(success())
    mocks.inspect.mockResolvedValue(facts())
    mocks.write.mockResolvedValue({ secretValues: ["segredo-privado"] })
    mocks.remove.mockResolvedValue(undefined)
    mocks.has.mockResolvedValue(true)
    mocks.interrupt.mockResolvedValue(undefined)
})

describe("coordenador: shell para o host, agente para a ação", () => {
    it("inspecionar lê o host pelo shell e usa o agente só para a versão do banco", async () => {
        store.op.docs[0].kind = "inspect"
        mocks.run.mockResolvedValueOnce(db("m005"))
        await executeEnvironment(opId)
        expect(mocks.inspect).toHaveBeenCalledTimes(1)
        expect(mocks.run).toHaveBeenCalledTimes(1)
        expect(prompts()[0].stage).toBe("environment-db")
        expect(prompts()[0].text).toContain("SOMENTE LEITURA")
        expect(store.op.docs[0].state).toBe("succeeded")
        expect(store.env.docs[0]).toMatchObject({ dbVersion: "m005", compose: observed.compose, activeOperationId: null })
        expect(store.image.docs).toHaveLength(1)
        expect(mocks.write).toHaveBeenCalledTimes(1)
        expect(mocks.remove).toHaveBeenCalledWith(expect.anything(), expect.anything(), accessDir)
        expect(store.op.docs[0].accessPath).toBeNull()
    })
    it("versão do banco não identificada não derruba a inspeção nem apaga a versão registrada", async () => {
        store.op.docs[0].kind = "inspect"
        mocks.run.mockResolvedValueOnce({ ...success(), outcome: "failed", text: "sem resposta" })
        await executeEnvironment(opId)
        expect(store.op.docs[0].state).toBe("succeeded")
        expect(store.env.docs[0].dbVersion).toBe("m002")
        expect(store.op.docs[0].evidence).toContain("Versão do banco não identificada.")
    })
    it("diretório/compose ausente falha com código acionável e libera o ambiente", async () => {
        store.op.docs[0].kind = "inspect"
        mocks.inspect.mockRejectedValueOnce(new HostError("COMPOSE_NOT_FOUND", "Diretório /srv/app não encontrado no host."))
        await executeEnvironment(opId)
        expect(store.op.docs[0]).toMatchObject({ state: "failed", failureCode: "COMPOSE_NOT_FOUND" })
        expect(store.op.docs[0].error).toContain("/srv/app")
        expect(store.env.docs[0].activeOperationId).toBeNull()
        expect(mocks.run).not.toHaveBeenCalled()
    })
    it("acesso não gravado no host interrompe antes do agente", async () => {
        mocks.write.mockRejectedValueOnce(new HostError("ACCESS_WRITE_FAILED", "Não foi possível gravar o acesso"))
        await executeEnvironment(opId)
        expect(store.op.docs[0]).toMatchObject({ state: "failed", failureCode: "ACCESS_WRITE_FAILED" })
        expect(mocks.run).not.toHaveBeenCalled()
        expect(store.env.docs[0].activeOperationId).toBeNull()
    })
    it("publicar: preflight pelo shell, ação do agente e conferência final no host", async () => {
        await executeEnvironment(opId)
        expect(mocks.inspect).toHaveBeenCalledTimes(2)
        expect(mocks.run).toHaveBeenCalledTimes(1)
        expect(prompts()[0].text).toContain("EXCLUSIVAMENTE a operação publish")
        expect(prompts()[0].text).toContain("O Opex já gravou o acesso temporário")
        expect(prompts()[0].text).not.toContain("curl")
        expect(store.image.docs.map((doc) => doc.operationId)).toEqual([`${opId}:before`, opId])
        expect(store.op.docs[0]).toMatchObject({ state: "succeeded", sessionId: "session" })
        expect(store.env.docs[0].activeOperationId).toBeNull()
    })
    it("agente diz que publicou, mas o host não mostra o container: RESULT_UNVERIFIED", async () => {
        mocks.inspect
            .mockResolvedValueOnce(facts())
            .mockResolvedValueOnce(facts({ containers: [{ service: "app", id: "c1", state: "exited", health: null }], healthy: false }))
        await executeEnvironment(opId)
        expect(store.op.docs[0]).toMatchObject({ state: "failed", failureCode: "RESULT_UNVERIFIED" })
        // Host sem processos do projeto: a reserva é liberada.
        expect(store.env.docs[0].activeOperationId).toBeNull()
    })
    it("falha do agente com build ainda rodando mantém a reserva para reconciliação", async () => {
        mocks.run.mockResolvedValueOnce({ ...success(), outcome: "failed", text: "Disco cheio" })
        mocks.inspect.mockResolvedValueOnce(facts()).mockResolvedValueOnce(facts({ quiescent: false }))
        await executeEnvironment(opId)
        expect(store.op.docs[0].state).toBe("reconciling")
        expect(store.env.docs[0].activeOperationId).toBe(opId)
        expect(mocks.interrupt).toHaveBeenCalledWith({ sessionID: "session" })
    })
    it("saúde ruim no host produz degradado, sem rollback", async () => {
        mocks.inspect
            .mockResolvedValueOnce(facts())
            .mockResolvedValueOnce(
                facts({ containers: [{ service: "app", id: "c1", state: "running", health: "unhealthy" }], healthy: false }),
            )
        await executeEnvironment(opId)
        expect(store.op.docs[0].state).toBe("degraded")
        expect(mocks.run).toHaveBeenCalledTimes(1)
    })
    it("checkpoint de migração fica gravado mesmo se uma etapa posterior falhar, sem segredo", async () => {
        mocks.run.mockImplementationOnce(async (_client, _request, hooks) => {
            await hooks?.onText?.(
                `OPEX_CHECKPOINT ${JSON.stringify({ stage: "Migração aplicada segredo-privado", dbVersion: "m003", databaseCertain: true, migrations: ["m003"], evidence: ["Migração m003 aplicada; segredo-privado"] })}\n`,
            )
            return { ...success(), outcome: "failed", text: "Falhou após migração" }
        })
        await executeEnvironment(opId)
        expect(store.env.docs[0].dbVersion).toBe("m003")
        expect(JSON.stringify(store.op.docs[0].migrations)).toContain("m003")
        expect(JSON.stringify(store.deployment.docs)).not.toContain("segredo-privado")
        expect(JSON.stringify(store.op.docs)).not.toContain("segredo-privado")
    })
    it("restauração: banco mudou no host bloqueia antes do turno mutante", async () => {
        store.op.docs[0].kind = "restore"
        store.op.docs[0].imageId = imageId
        store.image.docs.push({ _id: imageId, environmentId: envId, dbVersion: "m001", images: observed.images })
        mocks.run.mockResolvedValueOnce(db("m002"))
        await executeEnvironment(opId)
        expect(mocks.run).toHaveBeenCalledTimes(1)
        expect(prompts()[0].stage).toBe("environment-db")
        expect(store.op.docs[0].state).toBe("failed")
        expect(store.env.docs[0].activeOperationId).toBeNull()
    })
    it("restauração multisserviço só conclui com TODO o conjunto de IDs de pé no host", async () => {
        const images = [...observed.images, { ...observed.images[0], service: "worker", imageId: `sha256:${"b".repeat(64)}` }]
        store.op.docs[0].kind = "restore"
        store.op.docs[0].imageId = imageId
        store.image.docs.push({ _id: imageId, environmentId: envId, dbVersion: "m002", images })
        mocks.run.mockResolvedValueOnce(db("m002")).mockResolvedValueOnce(success())
        await executeEnvironment(opId)
        expect(prompts()[1].text).toContain(images[1].imageId)
        expect(prompts()[1].text).toContain("--no-build --pull never")
        expect(store.op.docs[0]).toMatchObject({ state: "failed", failureCode: "RESULT_UNVERIFIED" })
        resetStore()
        seedOperation({ kind: "restore", imageId })
        store.image.docs.push({ _id: imageId, environmentId: envId, dbVersion: "m002", images })
        mocks.run.mockResolvedValueOnce(db("m002")).mockResolvedValueOnce(success())
        const both = facts({
            images,
            containers: [
                { service: "app", id: "c1", state: "running", health: null },
                { service: "worker", id: "c2", state: "running", health: null },
            ],
        })
        mocks.inspect.mockResolvedValueOnce(facts()).mockResolvedValueOnce(both)
        await executeEnvironment(opId)
        expect(store.op.docs[0].state).toBe("succeeded")
    })
    it("reconciliação sem sessão a retomar só observa o host e não chama o agente", async () => {
        store.op.docs[0].sessionId = "old-session"
        store.op.docs[0].phase = "preflight"
        mocks.probe.mockResolvedValue({ kind: "finished", outcome: "succeeded" })
        await executeEnvironment(opId, true)
        expect(mocks.run).not.toHaveBeenCalled()
        expect(store.op.docs[0].state).toBe("interrupted")
        expect(store.env.docs[0].activeOperationId).toBeNull()
    })
    it("reconciliação com processo ainda ativo no host mantém a reserva", async () => {
        mocks.inspect.mockResolvedValueOnce(facts({ quiescent: false }))
        await executeEnvironment(opId, true)
        expect(store.op.docs[0].state).toBe("reconciling")
        expect(store.env.docs[0].activeOperationId).toBe(opId)
    })
    it("retoma a ação existente sem regravar o acesso e preserva tudo se o OpenCode cair", async () => {
        store.op.docs[0].sessionId = "old-session"
        store.op.docs[0].phase = "action"
        store.op.docs[0].accessPath = accessDir
        mocks.probe.mockResolvedValue({ kind: "running" })
        await executeEnvironment(opId, true)
        expect(mocks.create).not.toHaveBeenCalled()
        expect(mocks.write).not.toHaveBeenCalled()
        expect(prompts()[0].attach).toBe(true)
        resetStore()
        seedOperation({ sessionId: "old-session", phase: "action", accessPath: accessDir })
        mocks.probe.mockResolvedValue({ kind: "unavailable" })
        mocks.remove.mockClear()
        await executeEnvironment(opId, true)
        expect(store.env.docs[0].activeOperationId).toBe(opId)
        expect(mocks.remove).not.toHaveBeenCalled()
    })
    it("CD: acompanha o run, confere imagem nova no host e usa o agente só para o banco", async () => {
        store.op.docs.length = 0
        seedOperation({ method: "cd", cdRequestedAt: new Date("2026-10-16T11:00:00Z") })
        mocks.dispatch.mockResolvedValue({ runId: 42, runUrl: "https://github.com/run/42", sha: "abc", conclusion: "success" })
        mocks.run.mockResolvedValueOnce(db("m004"))
        await executeEnvironment(opId)
        expect(mocks.dispatch).toHaveBeenCalledTimes(1)
        expect(mocks.inspect).toHaveBeenCalledTimes(1)
        expect(prompts().map((prompt) => prompt.stage)).toEqual(["environment-db"])
        expect(store.op.docs[0].state).toBe("succeeded")
        expect(store.env.docs[0].dbVersion).toBe("m004")
    })
})
