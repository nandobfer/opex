import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ updateOne: vi.fn(), connect: vi.fn(), publish: vi.fn(), warn: vi.fn() }))
vi.mock("@/lib/db", () => ({ dbConnect: mocks.connect }))
vi.mock("@/lib/db/models/AiConsumption", () => ({ AiConsumption: { updateOne: mocks.updateOne } }))
vi.mock("@/lib/pusher/channels", () => ({ publishAppEvent: mocks.publish }))
vi.mock("@/lib/logger", () => ({ loggerFor: () => ({ warn: mocks.warn }) }))

import { AI_CONSUMPTION_UPDATED_EVENT, recordAiConsumption } from "@/lib/ai/consumption"

const input = {
    dedupKey: "session:agentic:w1:m1",
    provider: "opencode",
    origin: "agentic",
    subject: "w1",
    model: "anthropic/claude",
    inputTokens: 10,
    outputTokens: 5,
    totalTokens: 17,
    costUsd: 0.5,
}

beforeEach(() => vi.clearAllMocks())

describe("recordAiConsumption", () => {
    it("grava por identidade estável ($setOnInsert) e publica quando é novo", async () => {
        mocks.updateOne.mockResolvedValue({ upsertedCount: 1 })
        await recordAiConsumption(input)
        expect(mocks.updateOne).toHaveBeenCalledWith(
            { dedupKey: input.dedupKey },
            { $setOnInsert: expect.objectContaining({ provider: "opencode", origin: "agentic", totalTokens: 17, costUsd: 0.5 }) },
            { upsert: true },
        )
        expect(mocks.publish).toHaveBeenCalledWith(AI_CONSUMPTION_UPDATED_EVENT, { provider: "opencode", origin: "agentic" })
    })

    it("reenvio do mesmo passo não duplica nem publica de novo", async () => {
        mocks.updateOne.mockResolvedValue({ upsertedCount: 0 })
        await recordAiConsumption(input)
        expect(mocks.publish).not.toHaveBeenCalled()
    })

    it("falha de telemetria não lança (só loga)", async () => {
        mocks.updateOne.mockRejectedValue(new Error("db down"))
        await expect(recordAiConsumption(input)).resolves.toBeUndefined()
        expect(mocks.warn).toHaveBeenCalled()
    })
})
