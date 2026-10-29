import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
    doc: null as null | { settings: Record<string, unknown>; updatedAt: Date },
    updateOne: vi.fn(),
    recordAudit: vi.fn(),
    publish: vi.fn(async () => {}),
    statuses: vi.fn(),
    models: vi.fn(),
    agents: vi.fn(),
}))

vi.mock("@/lib/db", () => ({ dbConnect: vi.fn(), recordAudit: mocks.recordAudit, AcaoAuditoria: { CRIAR: "CRIAR", ATUALIZAR: "ATUALIZAR" } }))
vi.mock("@/lib/db/models/Ai", () => ({
    AiFeatureSetting: {
        findOne: () => ({ lean: async () => mocks.doc }),
        updateOne: mocks.updateOne,
    },
}))
vi.mock("@/lib/ai/catalog", () => ({ getAiProviderStatuses: mocks.statuses, listAiModels: mocks.models, listAiAgents: mocks.agents }))
vi.mock("@/lib/pusher/channels", () => ({ publishAppEvent: mocks.publish }))
vi.mock("@/lib/after-response", () => ({ runAfterResponse: vi.fn() }))

import { DEFAULT_PR_REVIEW_SETTINGS, type PrReviewSettings } from "@/features/pr-review/schemas"
import { availabilityOfPrReview, getPrReviewSettings, savePrReviewSettings } from "@/features/ai/server/settings"

const settings = (overrides: Partial<PrReviewSettings> = {}): PrReviewSettings => ({ ...DEFAULT_PR_REVIEW_SETTINGS, enabled: true, model: "anthropic/claude", ...overrides })

beforeEach(() => {
    vi.clearAllMocks()
    mocks.doc = null
    mocks.statuses.mockResolvedValue([{ id: "opencode", integrationId: "ai_opencode", name: "OpenCode", configured: true, connected: true }])
    mocks.models.mockResolvedValue([{ id: "anthropic/claude", name: "Claude", variants: ["high"], group: "anthropic", contextWindow: null, free: false }])
    mocks.agents.mockResolvedValue([{ id: "build", name: "Build", description: null }])
})

describe('configuração do "Agente Revisor"', () => {
    it("sem nada salvo: desativada, critério Todos, replaneja sem limite e skill code-review", async () => {
        const dto = await getPrReviewSettings()
        expect(dto).toMatchObject({ isDefault: true, availability: { available: false } })
        expect(dto.settings).toMatchObject({ skill: "code-review", scope: "all", replanOnChanges: true, replanLimit: { enabled: false } })
    })

    it("disponível só com OpenCode conectado e modelo escolhido", async () => {
        expect(await availabilityOfPrReview(settings())).toEqual({ available: true, reason: null })
        mocks.statuses.mockResolvedValue([{ id: "opencode", integrationId: "ai_opencode", name: "OpenCode", configured: true, connected: false }])
        expect((await availabilityOfPrReview(settings())).reason).toContain("OpenCode não está conectado")
    })

    it("salva com o catálogo conferido, audita e avisa as telas", async () => {
        await savePrReviewSettings(settings({ agent: "build", variant: "", scope: "review_requested", replanLimit: { enabled: true, max: 2 } }), "local")
        expect(mocks.updateOne).toHaveBeenCalledWith(
            { feature: "pr-review" },
            expect.objectContaining({ $set: expect.objectContaining({ settings: expect.objectContaining({ agent: "build", variant: null, scope: "review_requested", replanLimit: { enabled: true, max: 2 } }) }) }),
            { upsert: true },
        )
        expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entidade: "FeatureIA", entidadeId: "pr-review" }))
        expect(mocks.publish).toHaveBeenCalledWith("ai-feature-updated", { feature: "pr-review" })
    })

    it("agente inexistente é recusado sem gravar", async () => {
        await expect(savePrReviewSettings(settings({ agent: "plan" }), "local")).rejects.toMatchObject({ code: "AI_AGENT_NOT_FOUND" })
        expect(mocks.updateOne).not.toHaveBeenCalled()
    })
})
