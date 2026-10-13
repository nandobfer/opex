import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
    ops: null as unknown as { docs: Record<string, unknown>[]; create: (doc: Record<string, unknown>) => Promise<{ _id: string }> },
    agenticActive: vi.fn(),
}))

vi.mock("@/lib/db", () => ({ dbConnect: vi.fn() }))
vi.mock("@/lib/db/models/EnvironmentOperation", async () => {
    const { memoryModel } = await import("../../helpers/memory-model")
    mocks.ops = memoryModel()
    return { EnvironmentOperation: mocks.ops }
})
vi.mock("@/features/agentic/server/build-queue", () => ({
    waitingBuilds: vi.fn(async () => []),
    hasActiveAgenticBuild: mocks.agenticActive,
}))

import { isAnyLocalBuildRunning, localQueuePosition, localQueuePositions, waitingLocalOperations } from "@/features/environments/server/queue"

const queued = async (createdAt: Date, environmentId: string, overrides: Record<string, unknown> = {}) =>
    (await mocks.ops.create({ environmentId, type: "publish", method: "local", status: "queued", createdAt, ...overrides }))._id as string

beforeEach(() => {
    vi.clearAllMocks()
    mocks.ops.docs.length = 0
    mocks.agenticActive.mockResolvedValue(false)
})

describe("queue — fila local das publicações", () => {
    it("ordena por chegada (FIFO) e devolve a posição por ambiente", async () => {
        await queued(new Date("2026-01-01T10:00:00Z"), "env-1")
        await queued(new Date("2026-01-01T10:01:00Z"), "env-2")

        expect((await waitingLocalOperations()).map((op) => op.environmentId)).toEqual(["env-1", "env-2"])
        expect(await localQueuePositions()).toEqual(new Map([["env-1", 1], ["env-2", 2]]))
        expect(await localQueuePosition("env-2")).toBe(2)
        expect(await localQueuePosition("env-9")).toBeNull()
    })

    it("ignora operações remotas, de restauração e já em andamento", async () => {
        await queued(new Date("2026-01-01T10:00:00Z"), "env-local")
        await queued(new Date("2026-01-01T10:01:00Z"), "env-remote", { method: "cd" })
        await queued(new Date("2026-01-01T10:02:00Z"), "env-restore", { type: "restore" })
        await queued(new Date("2026-01-01T10:03:00Z"), "env-running", { status: "running" })

        expect((await waitingLocalOperations()).map((op) => op.environmentId)).toEqual(["env-local"])
    })
})

describe("queue — build local em andamento", () => {
    it("detecta publicação local em execução", async () => {
        await queued(new Date(), "env-1", { status: "running" })
        expect(await isAnyLocalBuildRunning()).toBe(true)
    })

    it("considera o build agêntico", async () => {
        mocks.agenticActive.mockResolvedValue(true)
        expect(await isAnyLocalBuildRunning()).toBe(true)
    })

    it("sem operação e sem build agêntico fica livre", async () => {
        expect(await isAnyLocalBuildRunning()).toBe(false)
    })
})
