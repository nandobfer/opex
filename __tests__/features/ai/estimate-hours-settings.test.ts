import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
    doc: null as null | { settings: Record<string, unknown>; updatedAt: Date },
    updateOne: vi.fn(),
    recordAudit: vi.fn(),
    publish: vi.fn(async () => {}),
    statuses: vi.fn(),
    confirm: vi.fn(),
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
// A conexão é confirmada na hora (OPE-91); aqui ela segue o status gravado do mock.
vi.mock("@/lib/ai/connection", () => ({ confirmAiProviderConnection: mocks.confirm }))
vi.mock("@/lib/pusher/channels", () => ({ publishAppEvent: mocks.publish }))
vi.mock("@/lib/after-response", () => ({ runAfterResponse: vi.fn() }))

import { DEFAULT_ESTIMATE_HOURS_SETTINGS, estimateHoursSettingsSchema, type EstimateHoursSettings } from "@/features/ai/schemas"
import { availabilityOfEstimateHours, getEstimateHoursSettings, normalizeEstimateHoursSettings, saveEstimateHoursSettings } from "@/features/ai/server/settings"

const settings = (overrides: Partial<EstimateHoursSettings> = {}): EstimateHoursSettings => ({
    ...DEFAULT_ESTIMATE_HOURS_SETTINGS,
    enabled: true,
    provider: "opencode",
    model: "anthropic/claude",
    ...overrides,
})

const connected = (overrides: Record<string, unknown> = {}) => [
    { id: "opencode", integrationId: "ai_opencode", name: "OpenCode", configured: true, connected: true, ...overrides },
    { id: "gemini", integrationId: "ai_gemini", name: "Gemini", configured: false, connected: false },
]

beforeEach(() => {
    vi.clearAllMocks()
    mocks.doc = null
    mocks.statuses.mockResolvedValue(connected())
    mocks.confirm.mockImplementation(async (id: string) => {
        const status = ((await mocks.statuses()) as { id: string; configured: boolean; connected: boolean }[]).find((item) => item.id === id)
        return { configured: Boolean(status?.configured), connected: Boolean(status?.connected), detail: null }
    })
    mocks.models.mockResolvedValue([{ id: "anthropic/claude", name: "Claude", variants: ["high"], group: "anthropic", contextWindow: null, free: false }])
    mocks.agents.mockResolvedValue([{ id: "estimador", name: "Estimador", description: null }])
})

describe('schema de "Estimar prazos"', () => {
    it("ativada exige provedor e modelo; desativada aceita vazio", () => {
        const result = estimateHoursSettingsSchema.safeParse({ ...DEFAULT_ESTIMATE_HOURS_SETTINGS, enabled: true })
        expect(result.success).toBe(false)
        expect(result.error?.issues.map((issue) => issue.message)).toEqual(["Selecione o provedor", "Selecione o modelo"])
        expect(estimateHoursSettingsSchema.safeParse(DEFAULT_ESTIMATE_HOURS_SETTINGS).success).toBe(true)
    })
})

describe("configuração e disponibilidade", () => {
    it("sem nada salvo, devolve os valores iniciais (desativada) e explica o motivo", async () => {
        const dto = await getEstimateHoursSettings()
        expect(dto).toMatchObject({ isDefault: true, settings: DEFAULT_ESTIMATE_HOURS_SETTINGS, availability: { available: false } })
        expect(dto.availability.reason).toContain("desativada")
    })

    it("disponível só com a feature ativa, provedor e modelo escolhidos e o provedor conectado", async () => {
        expect(await availabilityOfEstimateHours(settings())).toEqual({ available: true, reason: null })
        expect((await availabilityOfEstimateHours(settings({ model: null }))).reason).toContain("provedor e o modelo")
        mocks.statuses.mockResolvedValue(connected({ connected: false }))
        expect((await availabilityOfEstimateHours(settings())).reason).toContain("OpenCode não está conectado")
    })

    it("normaliza agente e variante vazios para null", () => {
        expect(normalizeEstimateHoursSettings(settings({ agent: "", variant: "" }))).toMatchObject({ agent: null, variant: null })
    })
})

describe("salvar", () => {
    it("confere o catálogo do OpenCode, grava, audita e avisa as telas", async () => {
        await saveEstimateHoursSettings(settings({ agent: "estimador", variant: "high" }), "local")
        expect(mocks.updateOne).toHaveBeenCalledWith({ feature: "estimate-hours" }, expect.objectContaining({ $set: expect.objectContaining({ settings: expect.objectContaining({ agent: "estimador", variant: "high" }), updatedBy: "local" }) }), { upsert: true })
        expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entidade: "FeatureIA", entidadeId: "estimate-hours", acao: "CRIAR" }))
        expect(mocks.publish).toHaveBeenCalledWith("ai-feature-updated", { feature: "estimate-hours" })
    })

    it("modelo/variante/agente inexistentes são recusados sem gravar", async () => {
        await expect(saveEstimateHoursSettings(settings({ model: "x/y" }), "local")).rejects.toMatchObject({ code: "AI_MODEL_NOT_FOUND" })
        await expect(saveEstimateHoursSettings(settings({ variant: "max" }), "local")).rejects.toMatchObject({ code: "AI_VARIANT_NOT_FOUND" })
        await expect(saveEstimateHoursSettings(settings({ agent: "build" }), "local")).rejects.toMatchObject({ code: "AI_AGENT_NOT_FOUND" })
        expect(mocks.updateOne).not.toHaveBeenCalled()
    })
})
