import { describe, expect, it, vi } from "vitest"
import type { MetricsContext } from "@/features/agent-metrics/server/context"

const mocks = vi.hoisted(() => ({ text: vi.fn(async () => [] as { cost: number }[]), jev: vi.fn(async () => [] as { cost: number }[]), decisions: vi.fn(async () => [] as { decision: string; reason: string }[]) }))
vi.mock("@nandobfer/integracoes/modules/integrations/ia/models/AiConsumption", () => ({ AiConsumption: { aggregate: mocks.text } }))
vi.mock("@/lib/db/models/Ai", () => ({ AiUsageLog: { aggregate: mocks.jev } }))
vi.mock("@/features/secretary-agent/server/models", () => ({
    secretaryDb: vi.fn(),
    SecretaryDecisionRecord: { find: () => ({ select: () => ({ lean: mocks.decisions }) }) },
}))

import { secretaryMetrics } from "@/features/secretary-agent/server/metrics"

describe("secretaryMetrics", () => {
    it("separa uma intervenção do dono das oito mensagens barradas pela pausa", async () => {
        mocks.decisions.mockResolvedValueOnce([
            { decision: "paused", reason: "O dono assumiu a conversa pelo WhatsApp." },
            ...Array.from({ length: 8 }, () => ({ decision: "paused", reason: "Pausa ativa nesta conversa." })),
        ])
        const result = await secretaryMetrics({ range: { from: new Date(0), to: new Date() } } as MetricsContext)
        expect(result.kpis).toEqual(expect.arrayContaining([
            expect.objectContaining({ id: "pauses", label: "Mensagens em pausa", value: 8 }),
            expect.objectContaining({ id: "owner-takeovers", value: 1 }),
        ]))
    })
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
