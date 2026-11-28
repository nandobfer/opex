import { beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_SECRETARY_SETTINGS, type SecretarySettings } from "@/features/secretary-agent/schemas"

const mocks = vi.hoisted(() => ({ jev: vi.fn(), inference: vi.fn(), consumption: vi.fn(), usage: vi.fn() }))
vi.mock("@nandobfer/integracoes/modules/integrations/ia/ai/jev", () => ({ askJevSystemOne: mocks.jev }))
vi.mock("@/features/secretary-agent/server/ai", () => ({ secretaryInference: mocks.inference }))
vi.mock("@nandobfer/integracoes/modules/integrations/ia/models/AiConsumption", () => ({ AiConsumption: { aggregate: mocks.consumption } }))
vi.mock("@nandobfer/integracoes/modules/integrations/ia/models/AiUsageLog", () => ({ AiUsageLog: { aggregate: mocks.usage } }))

import { decideSubject } from "@/features/secretary-agent/server/decide-subject"
import { spentTodayUsd } from "@/features/secretary-agent/server/budget"
import { jevBandOf } from "@/features/secretary-agent/jev-subjects"

const MONEY = { id: "dinheiro", name: "Dinheiro", description: "pedidos de pix", examples: ["me empresta"] }
const WORK = { id: "trabalho", name: "Trabalho", description: "", examples: [] }

function settings(decision: Partial<SecretarySettings["decision"]["model"]>, subjects: Partial<SecretarySettings["criteria"]["subjects"]>): SecretarySettings {
    return {
        ...DEFAULT_SECRETARY_SETTINGS,
        main: { ...DEFAULT_SECRETARY_SETTINGS.main, provider: "opencode-go", model: "m" },
        decision: { model: { ...DEFAULT_SECRETARY_SETTINGS.decision.model, ...decision } },
        criteria: { ...DEFAULT_SECRETARY_SETTINGS.criteria, subjects: { ...DEFAULT_SECRETARY_SETTINGS.criteria.subjects, ...subjects } },
    }
}
const jevSettings = (subjects: Partial<SecretarySettings["criteria"]["subjects"]>) => settings({ sameAsAgent: false, provider: "jev", model: "jev-1" }, subjects)
const input = { text: "me empresta 50?", context: ["oi"], id: "T:subject", origin: "secretary-decision" }

beforeEach(() => vi.clearAllMocks())

describe("decideSubject com o JEV", () => {
    it("faixas: sim a partir de 70%, não até 30%", () => {
        expect([jevBandOf(0.7), jevBandOf(0.5), jevBandOf(0.3)]).toEqual(["yes", "unsure", "no"])
    })

    it("assunto bloqueado com sim ou incerto bloqueia; só o sim libera", async () => {
        mocks.jev.mockResolvedValueOnce({ model: "jev-1", answers: { b_dinheiro: { type: "noul", noul: 0.5 }, a_trabalho: { type: "noul", noul: 0.6 } } })
        const trace = await decideSubject(jevSettings({ blocked: [MONEY], mode: "only", allowed: [WORK] }), input)
        expect(trace.decider).toBe("jev")
        expect(trace.decision.blocked).toEqual(["dinheiro"])
        expect(trace.decision.allowed).toEqual([])
        expect(trace.answers.map((answer) => [answer.id, answer.band])).toEqual([["dinheiro", "unsure"], ["trabalho", "unsure"]])
        const call = mocks.jev.mock.calls[0]![0] as { questions: Record<string, unknown>; tracking: { feature: string } }
        expect(Object.keys(call.questions)).toEqual(["b_dinheiro", "a_trabalho"])
        expect(call.tracking.feature).toBe("secretary-decision")

        mocks.jev.mockResolvedValueOnce({ answers: { b_dinheiro: { type: "noul", noul: 0.1 }, a_trabalho: { type: "noul", noul: 0.9 } } })
        const ok = await decideSubject(jevSettings({ blocked: [MONEY], mode: "only", allowed: [WORK] }), input)
        expect(ok.decision).toMatchObject({ blocked: [], allowed: ["trabalho"], topic: "Trabalho" })
    })

    it("resposta faltando ou JEV fora sobe o erro (o turno vira \"erro\")", async () => {
        mocks.jev.mockResolvedValueOnce({ answers: {} })
        await expect(decideSubject(jevSettings({ blocked: [MONEY] }), input)).rejects.toThrow("Dinheiro")
        mocks.jev.mockRejectedValueOnce(new Error("O JEV respondeu HTTP 500"))
        await expect(decideSubject(jevSettings({ blocked: [MONEY] }), input)).rejects.toThrow("HTTP 500")
    })
})

describe("decideSubject com modelo de texto", () => {
    it("\"Mesmo do agente\" usa o modelo principal e descarta ids desconhecidos", async () => {
        mocks.inference.mockResolvedValueOnce({ blocked: ["dinheiro", "inventado"], allowed: ["trabalho"], topic: "Empréstimo", reason: "pede dinheiro" })
        const trace = await decideSubject(settings({}, { blocked: [MONEY] }), input)
        expect(mocks.inference).toHaveBeenCalledWith(expect.objectContaining({ model: expect.objectContaining({ provider: "opencode-go", model: "m" }), origin: "secretary-decision" }))
        expect(trace.decision).toEqual({ blocked: ["dinheiro"], allowed: [], topic: "Empréstimo", reason: "pede dinheiro" })
        expect(mocks.jev).not.toHaveBeenCalled()
    })
})

describe("orçamento diário", () => {
    it("soma as respostas e as decisões (texto e JEV); a simulação fica de fora", async () => {
        mocks.consumption.mockResolvedValueOnce([{ total: 0.5 }])
        mocks.usage.mockResolvedValueOnce([{ total: 0.25 }])
        expect(await spentTodayUsd(new Date())).toBe(0.75)
        const match = (mocks.consumption.mock.calls[0]![0] as [{ $match: { origin: { $in: string[] } } }])[0].$match
        expect(match.origin.$in).toEqual(["secretary-agent", "secretary-decision"])
        expect(match.origin.$in).not.toContain("secretary-simulation")
        expect((mocks.usage.mock.calls[0]![0] as [{ $match: { feature: string } }])[0].$match.feature).toBe("secretary-decision")
    })
})
