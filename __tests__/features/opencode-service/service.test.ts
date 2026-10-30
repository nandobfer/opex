import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
    settings: vi.fn(),
    runSsh: vi.fn(),
    probe: vi.fn(),
    serverInfo: vi.fn(),
    exists: vi.fn(),
    create: vi.fn(),
    findRunning: vi.fn(),
    updateMany: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    updateIntegration: vi.fn(),
    recordAudit: vi.fn(),
    publish: vi.fn(),
    fetchNpm: vi.fn(),
    hostRun: vi.fn(),
}))

vi.mock("@/features/opencode-service/server/ssh", async (importActual) => ({
    ...(await importActual<typeof import("@/features/opencode-service/server/ssh")>()),
    getSshSettings: mocks.settings,
    runSsh: mocks.runSsh,
    probeHostFingerprint: mocks.probe,
}))
vi.mock("@/lib/ai/opencode", () => ({ getOpencodeConnection: vi.fn(async () => ({ baseUrl: "http://h:5050", headers: {} })) }))
vi.mock("@/lib/ai/opencode-client", () => ({ getOpencodeClient: vi.fn(async () => ({ server: { info: mocks.serverInfo } })) }))
vi.mock("@/lib/db", () => ({ dbConnect: vi.fn(), recordAudit: mocks.recordAudit, AcaoAuditoria: { ATUALIZAR: "ATUALIZAR", EXECUTAR: "EXECUTAR" } }))
vi.mock("@/lib/db/models/OpencodeServiceOperation", () => ({
    OpencodeServiceOperation: {
        find: () => ({ select: () => ({ lean: mocks.findRunning }) }),
        updateMany: mocks.updateMany,
        exists: mocks.exists,
        create: mocks.create,
        findByIdAndUpdate: (...args: unknown[]) => ({ lean: () => mocks.findByIdAndUpdate(...args) }),
        findOne: () => ({ sort: () => ({ lean: async () => null }) }),
    },
}))
vi.mock("@/lib/db/models/Agentic", () => ({ AgenticWorkbench: { countDocuments: vi.fn(async () => 2) } }))
vi.mock("@/lib/db/models/Refinement", () => ({ TaskRefinement: { countDocuments: vi.fn(async () => 1) } }))
vi.mock("@/lib/pusher/channels", () => ({ publishAppEvent: mocks.publish }))
vi.mock("@/features/integrations/services/integration-service", () => ({ updateIntegration: mocks.updateIntegration }))
vi.mock("@/features/opencode-resources/server/versions", () => ({ fetchNpmPackage: mocks.fetchNpm }))
vi.mock("@/features/local-docker/server/shell", () => ({ createHostRunner: () => mocks.hostRun }))
vi.mock("@/features/opencode-resources/server/host", () => ({ opencodeDebug: {} }))

import { getServiceImpact, runServiceAction, trustHostKey } from "@/features/opencode-service/server/service"

const actor = { id: "local", origin: "ui" as const }
const trusted = { host: "h", port: 22, username: "u", privateKey: "k", fingerprint: "SHA256:abc", bin: "/b/opencode" }
const opDoc = (over: Record<string, unknown> = {}) => ({ _id: "507f1f77bcf86cd799439011", action: "restart", status: "running", fromVersion: "2.2.1", toVersion: null, output: "", error: null, origin: "ui", opexSessionId: null, createdBy: "local", startedAt: new Date("2026-10-30T00:00:00Z"), finishedAt: null, ...over })

beforeEach(() => {
    vi.clearAllMocks()
    mocks.settings.mockResolvedValue(trusted)
    mocks.findRunning.mockResolvedValue([])
    mocks.exists.mockResolvedValue(null)
    mocks.serverInfo.mockResolvedValue({ version: "2.2.1", pid: 10, urls: ["http://0.0.0.0:5050"] })
    mocks.create.mockImplementation(async (doc: Record<string, unknown>) => ({ toObject: () => opDoc(doc) }))
    mocks.findByIdAndUpdate.mockImplementation(async (_id: unknown, update: { $set: Record<string, unknown> }) => opDoc(update.$set))
    mocks.fetchNpm.mockResolvedValue({ versions: ["2.2.1", "2.2.2", "3.0.0"], distTags: { latest: "3.0.0" } })
})

describe("ações do serviço por SSH", () => {
    it("sem SSH configurado responde 409 sem executar nada", async () => {
        mocks.settings.mockResolvedValue({ ...trusted, privateKey: null })
        await expect(runServiceAction("restart", {}, actor)).rejects.toMatchObject({ status: 409, code: "OPENCODE_SSH_NOT_CONFIGURED" })
        mocks.settings.mockResolvedValue({ ...trusted, fingerprint: null })
        await expect(runServiceAction("restart", {}, actor)).rejects.toMatchObject({ code: "OPENCODE_SSH_UNTRUSTED" })
        expect(mocks.runSsh).not.toHaveBeenCalled()
    })

    it("uma operação por vez", async () => {
        mocks.exists.mockResolvedValue({ _id: "x" })
        await expect(runServiceAction("stop", {}, actor)).rejects.toMatchObject({ code: "OPENCODE_OPERATION_RUNNING" })
    })

    it("reiniciar: comando fixo, espera a API e audita", async () => {
        mocks.runSsh.mockResolvedValue({ exitCode: 0, output: "ok" })
        const op = await runServiceAction("restart", {}, actor)
        expect(mocks.runSsh).toHaveBeenCalledWith(`PATH='/b':"$PATH" '/b/opencode' service restart`, expect.any(Number), expect.anything())
        expect(op.status).toBe("succeeded")
        expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entidade: "ServicoOpenCode", depois: expect.objectContaining({ acao: "restart", origem: "ui" }) }))
    })

    it("falha do comando vira operação 'failed' com o motivo", async () => {
        mocks.runSsh.mockResolvedValue({ exitCode: 1, output: "erro: porta ocupada" })
        const op = await runServiceAction("start", {}, actor)
        expect(op).toMatchObject({ status: "failed", error: expect.stringContaining("porta ocupada") })
    })

    it("atualizar recusa major nova sem allowMajor e vai para a última 2.x em segundo plano", async () => {
        await expect(runServiceAction("upgrade", { version: "3.0.0" }, actor)).rejects.toMatchObject({ code: "OPENCODE_UPGRADE_REFUSED" })
        mocks.runSsh.mockReturnValue(new Promise(() => undefined))
        const op = await runServiceAction("upgrade", {}, actor)
        expect(op).toMatchObject({ status: "running", toVersion: "2.2.2" })
        expect(mocks.runSsh.mock.calls[0]![0]).toContain("upgrade '2.2.2'")
    })

    it("operações 'running' de outro processo viram 'interrompidas'", async () => {
        mocks.findRunning.mockResolvedValue([{ _id: "orfa" }])
        mocks.runSsh.mockResolvedValue({ exitCode: 0, output: "" })
        await runServiceAction("restart", {}, actor)
        expect(mocks.updateMany).toHaveBeenCalledWith({ _id: { $in: ["orfa"] } }, { $set: expect.objectContaining({ status: "interrupted" }) })
    })
})

describe("confiança na chave do host e impacto", () => {
    it("só grava a impressão digital que o host apresenta agora", async () => {
        mocks.probe.mockResolvedValue("SHA256:novo")
        await expect(trustHostKey("SHA256:outro", actor)).rejects.toMatchObject({ code: "OPENCODE_SSH_HOST_KEY_MISMATCH" })
        await trustHostKey("SHA256:novo", actor)
        expect(mocks.updateIntegration).toHaveBeenCalledWith("ai_opencode", { publicValues: { sshHostFingerprint: "SHA256:novo" } }, "local")
    })

    it("conta mesas e refinamentos rodando", async () => {
        expect(await getServiceImpact()).toEqual({ workbenches: 2, refinements: 1 })
    })
})
