import { beforeEach, describe, expect, it, vi } from "vitest"
import type { TurnRequest, TurnResult } from "@/lib/ai/opencode-run"
const mocks = vi.hoisted(() => ({
    create: vi.fn(),
    interrupt: vi.fn(),
    cleanup: vi.fn(),
    run: vi.fn<(client: unknown, req: TurnRequest) => Promise<TurnResult>>(),
}))
vi.mock("@/lib/db", () => ({ dbConnect: vi.fn() }))
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn() } }))
vi.mock("@/features/environments/server/events", () => ({ publishEnvironment: vi.fn() }))
vi.mock("@/features/environments/server/runner", () => ({ appendEnvironmentLog: vi.fn() }))
vi.mock("@/features/environments/server/credentials", () => ({
    grantAccess: async () => ({
        id: "logs-session",
        dir: "/tmp/opencode/operation-logs",
        token: "t".repeat(43),
        baseUrl: "http://127.0.0.1:7001",
        ttlMinutes: 30,
        secretValues: [],
    }),
    releaseAccess: mocks.cleanup,
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
vi.mock("@/lib/ai/opencode-run", () => ({ runAgentTurn: mocks.run }))
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
import { logViewer, logsHistory, reconcileLogs } from "@/features/environments/server/logs"
import { resetStore, store, repoId, envId } from "./fixtures"
const actor = { userId: "u", clientId: "c", projectIds: [repoId], canEdit: false, owner: false }

beforeEach(() => {
    vi.clearAllMocks()
    resetStore()
    mocks.create.mockResolvedValue({ id: "logs-session" })
    mocks.interrupt.mockResolvedValue(undefined)
    mocks.cleanup.mockResolvedValue(undefined)
    mocks.run.mockImplementation(async (_client, req) => {
        await new Promise<void>((resolve) => req.signal.addEventListener("abort", () => resolve(), { once: true }))
        return { outcome: "interrupted", text: "", message: null, costUsd: 0, durationMs: 1 }
    })
})
describe("espectadores independentes e histórico autorizado", () => {
    it("dois espectadores compartilham sessão; só o último encerra", async () => {
        const first = crypto.randomUUID(),
            second = crypto.randomUUID()
        await logViewer(actor, repoId, envId, first, false)
        await vi.waitFor(() => expect(mocks.run).toHaveBeenCalledTimes(1))
        await logViewer(actor, repoId, envId, second, false)
        expect(mocks.create).toHaveBeenCalledTimes(1)
        await logViewer(actor, repoId, envId, first, true)
        expect(mocks.interrupt).not.toHaveBeenCalled()
        expect(store.viewers.docs[0].viewers).toHaveLength(1)
        await logViewer(actor, repoId, envId, second, true)
        await vi.waitFor(() => expect(store.viewers.docs[0].state).toBe("idle"))
        expect(mocks.interrupt).toHaveBeenCalledTimes(1)
        expect(mocks.cleanup).toHaveBeenCalled()
    })
    it("history é isolado por scope e serviço, sem expor outro ambiente", async () => {
        store.log.docs.push(
            {
                _id: "1",
                integrationId: "ai",
                ts: new Date(),
                message: "app | pronto",
                data: { scope: `environment:${envId}` },
            },
            {
                _id: "2",
                integrationId: "ai",
                ts: new Date(),
                message: "db | pronto",
                data: { scope: `environment:${envId}` },
            },
            {
                _id: "3",
                integrationId: "ai",
                ts: new Date(),
                message: "outro cliente",
                data: { scope: "environment:outro" },
            },
        )
        expect(await logsHistory(actor, repoId, envId, undefined, "app")).toEqual([
            expect.objectContaining({ id: "1", message: "app | pronto" }),
        ])
        await expect(logsHistory({ ...actor, projectIds: [] }, repoId, envId)).rejects.toMatchObject({ status: 404 })
    })
    it("reconciliação interrompe sessão órfã antes de limpar acesso", async () => {
        store.viewers.docs.push({
            _id: "v",
            environmentId: envId,
            state: "running",
            viewers: [{ id: "old", expiresAt: new Date(0) }],
            sessionId: "orphan",
            accessPath: "/tmp/opencode/operation-old",
        })
        await reconcileLogs()
        expect(mocks.interrupt).toHaveBeenCalledWith({ sessionID: "orphan" })
        expect(mocks.cleanup).toHaveBeenCalled()
        expect(store.viewers.docs[0]).toMatchObject({ state: "idle", viewers: [], accessPath: null })
    })
})
