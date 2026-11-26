import { expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ bulkWrite: vi.fn(), find: vi.fn() }))

vi.mock("@/lib/db", () => ({ dbConnect: vi.fn() }))
vi.mock("@/lib/db/models/AgentMetrics", () => ({ AgentRun: { bulkWrite: mocks.bulkWrite }, AgentMetricTracking: {} }))
vi.mock("@/features/secretary-agent/server/models", () => ({
    secretaryDb: vi.fn(),
    SecretaryDecisionRecord: { find: (filter: unknown) => ({ lean: async () => mocks.find(filter) }) },
}))

import { syncAgentRuns } from "@/features/agent-metrics/server/sync"

it("sincroniza as decisões do Secretário com o custo do turno, nulo sem custo e falha no erro", async () => {
    const at = new Date("2026-11-25T16:00:00Z")
    mocks.find.mockReturnValue([
        { _id: "opex:M1", chatId: "5531", decision: "replied", reason: "Passou", at, costUsd: 0.0123 },
        { _id: "opex:M2", chatId: "5531", decision: "ignored", reason: "Fora do público", at },
        { _id: "opex:M3", chatId: "5531", decision: "error", reason: "Command Code recusou a chamada", at, costUsd: 0.002 },
    ])
    expect(await syncAgentRuns(["secretario"])).toBe(3)
    const runs = mocks.bulkWrite.mock.calls[0]![0].map((op: { updateOne: { update: { $set: Record<string, unknown> } } }) => op.updateOne.update.$set)
    expect(runs).toEqual([
        expect.objectContaining({ agent: "secretario", dedupKey: "secretario:opex:M1", costUsd: 0.0123, ok: true, error: null }),
        expect.objectContaining({ dedupKey: "secretario:opex:M2", costUsd: null, ok: true }),
        expect.objectContaining({ dedupKey: "secretario:opex:M3", costUsd: 0.002, ok: false, error: "Command Code recusou a chamada" }),
    ])
})
