import { beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({
    stream: vi.fn(),
    shellRemove: vi.fn(),
    write: vi.fn(),
    remove: vi.fn(),
}))
vi.mock("@/lib/db", () => ({ dbConnect: vi.fn() }))
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn() } }))
vi.mock("@/features/environments/server/events", () => ({ publishEnvironment: vi.fn() }))
vi.mock("@/features/environments/server/runner", () => ({ appendEnvironmentLog: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/features/environments/server/host", async (original) => ({
    ...(await original<typeof import("@/features/environments/server/host")>()),
    writeAccess: mocks.write,
    removeAccess: mocks.remove,
}))
vi.mock("@/features/ai/server/settings", async () => ({
    loadEnvironmentSettings: async () => ({ settings: (await import("./fixtures")).settings }),
}))
vi.mock("@/lib/ai/opencode-client", () => ({
    getOpencodeClient: async () => ({ shell: { remove: mocks.shellRemove } }),
    streamOpencodeShell: mocks.stream,
}))
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
vi.mock("@/lib/db/models/EnvironmentLogSession", async () => ({
    EnvironmentLogSession: (await import("./fixtures")).store.viewers,
}))
vi.mock("@/lib/db/models/IntegrationLog", async () => ({ IntegrationLog: (await import("./fixtures")).store.log }))
import { logLineService, logViewer, logsHistory, reconcileLogs, splitLogLines } from "@/features/environments/server/logs"
import { resetStore, store, repoId, envId } from "./fixtures"
const actor = { userId: "u", clientId: "c", projectIds: [repoId], canEdit: false, owner: false }

beforeEach(() => {
    vi.clearAllMocks()
    resetStore()
    mocks.shellRemove.mockResolvedValue(undefined)
    mocks.remove.mockResolvedValue(undefined)
    mocks.write.mockResolvedValue({ secretValues: ["segredo"] })
    // Simula o `docker compose logs -f`: entrega um bloco e fica rodando até o abort.
    mocks.stream.mockImplementation(
        async (
            _client: unknown,
            _dir: string,
            _command: string,
            options: { signal: AbortSignal; onStart: (id: string) => Promise<void>; onOutput: (chunk: string) => Promise<void> },
        ) => {
            await options.onStart("shell-1")
            await options.onOutput("app-1  | pronto segredo\nworker-1  | fila ok\nparci")
            await new Promise<void>((resolve) => options.signal.addEventListener("abort", () => resolve(), { once: true }))
            return { exitCode: null, status: "running", output: "" }
        },
    )
})

describe("logs pelo shell do OpenCode, compartilhados entre espectadores", () => {
    it("dois espectadores compartilham um shell; só o último encerra", async () => {
        const first = crypto.randomUUID(),
            second = crypto.randomUUID()
        await logViewer(actor, repoId, envId, first, false)
        await vi.waitFor(() => expect(store.log.docs.length).toBeGreaterThanOrEqual(2))
        await logViewer(actor, repoId, envId, second, false)
        expect(mocks.stream).toHaveBeenCalledTimes(1)
        expect(mocks.stream.mock.calls[0][2]).toMatch(/^sh -c '.*org-app-producao.* logs -f --no-color/)
        expect(store.viewers.docs[0].sessionId).toBe("shell-1")
        await logViewer(actor, repoId, envId, first, true)
        expect(store.viewers.docs[0].state).toBe("running")
        await logViewer(actor, repoId, envId, second, true)
        await vi.waitFor(() => expect(store.viewers.docs[0].state).toBe("idle"))
        // Acesso local: nada de helper SSH gravado no host.
        expect(mocks.write).not.toHaveBeenCalled()
    })
    it("grava uma linha por entrada, com serviço identificado e sem linha parcial", async () => {
        const viewer = crypto.randomUUID()
        await logViewer(actor, repoId, envId, viewer, false)
        await vi.waitFor(() => expect(store.log.docs.length).toBe(2))
        expect(store.log.docs.map((doc) => [doc.message, (doc.data as { service?: string }).service])).toEqual([
            ["app-1  | pronto segredo", "app"],
            ["worker-1  | fila ok", "worker"],
        ])
        expect(await logsHistory(actor, repoId, envId, undefined, "worker")).toEqual([
            expect.objectContaining({ message: "worker-1  | fila ok" }),
        ])
        await expect(logsHistory({ ...actor, projectIds: [] }, repoId, envId)).rejects.toMatchObject({ status: 404 })
        await logViewer(actor, repoId, envId, viewer, true)
        await vi.waitFor(() => expect(store.viewers.docs[0].state).toBe("idle"))
    })
    it("no remoto grava o helper SSH no host, censura segredos e remove o acesso ao encerrar", async () => {
        store.repo.docs[0].config = { ...store.repo.docs[0].config, mode: "remote" }
        const viewer = crypto.randomUUID()
        await logViewer(actor, repoId, envId, viewer, false)
        await vi.waitFor(() => expect(store.log.docs.length).toBe(2))
        expect(mocks.write.mock.calls[0][2]).toMatchObject({ variables: null })
        expect(mocks.stream.mock.calls[0][2]).toMatch(/^node '\/tmp\/opex-environments\/logs-/)
        expect(store.log.docs[0].message).toBe("app-1  | pronto [protegido]")
        await logViewer(actor, repoId, envId, viewer, true)
        await vi.waitFor(() => expect(store.viewers.docs[0]).toMatchObject({ state: "idle", accessPath: null }))
        expect(mocks.remove).toHaveBeenCalledWith(expect.anything(), expect.anything(), `/tmp/opex-environments/logs-${envId}`)
    })
    it("reconciliação remove shell órfão e acesso deixado no host", async () => {
        store.viewers.docs.push({
            _id: "v",
            environmentId: envId,
            state: "running",
            viewers: [{ id: "old", expiresAt: new Date(0) }],
            sessionId: "orphan",
            accessPath: `/tmp/opex-environments/logs-${envId}`,
        })
        await reconcileLogs()
        expect(mocks.shellRemove).toHaveBeenCalledWith({ id: "orphan", location: { directory: "/tmp" } })
        expect(mocks.remove).toHaveBeenCalled()
        expect(store.viewers.docs[0]).toMatchObject({ state: "idle", viewers: [], accessPath: null })
    })
    it("separa linhas e identifica o serviço do prefixo do compose", () => {
        expect(splitLogLines("ab", "c\nd\ne")).toEqual({ lines: ["abc", "d"], rest: "e" })
        expect(logLineService("app-1  | x")).toBe("app")
        expect(logLineService("db  | x")).toBe("db")
        expect(logLineService("sem prefixo")).toBeNull()
    })
})
