import { describe, expect, it, vi } from "vitest"
import type { MetricsContext } from "@/features/agent-metrics/server/context"

const mocks = vi.hoisted(() => ({ text: vi.fn(), jev: vi.fn() }))
vi.mock("@/lib/db/models/AiConsumption", () => ({ AiConsumption: { aggregate: mocks.text } }))
vi.mock("@/lib/db/models/Ai", () => ({ AiUsageLog: { aggregate: mocks.jev } }))
vi.mock("@/features/secretary-agent/server/models", () => ({
    secretaryDb: vi.fn(),
    SecretaryDecisionRecord: { find: () => ({ select: () => ({ lean: async () => [] }) }) },
}))

import { secretaryMetrics } from "@/features/secretary-agent/server/metrics"

describe("secretaryMetrics", () => {
    it("soma os custos do turno, da análise e do decisor de texto ou JEV, mas não da simulação", async () => {
        const from = new Date("2026-10-01")
        const to = new Date("2026-10-31")
        mocks.text.mockResolvedValueOnce([{ cost: 1.5 }])
        mocks.jev.mockResolvedValueOnce([{ cost: 0.25 }])
        const result = await secretaryMetrics({ range: { from, to } } as MetricsContext)
        expect(mocks.text).toHaveBeenCalledWith([
            { $match: { origin: { $in: ["secretary-agent", "secretary-decision", "secretary-analysis"] }, createdAt: { $gte: from, $lte: to } } },
            { $group: { _id: null, cost: { $sum: "$costUsd" } } },
        ])
        expect(mocks.jev).toHaveBeenCalledWith([
            { $match: { provider: "jev", feature: "secretary-decision", createdAt: { $gte: from, $lte: to } } },
            { $group: { _id: null, cost: { $sum: "$costUsd" } } },
        ])
        expect(result.kpis).toContainEqual(expect.objectContaining({ id: "secretary-cost", value: 1.75 }))
    })
})
