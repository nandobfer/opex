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

import { DEFAULT_TASK_TAGS_SETTINGS, taskTagsSettingsSchema, type TaskTagsSettings } from "@/features/ai/schemas"
import { availabilityOfTaskTags, getTaskTagsSettings, normalizeTaskTagsSettings, saveTaskTagsSettings } from "@/features/ai/server/settings"

const settings = (overrides: Partial<TaskTagsSettings> = {}): TaskTagsSettings => ({
    ...DEFAULT_TASK_TAGS_SETTINGS,
    enabled: true,
    provider: "gemini",
    model: "gemini-3-flash",
    ...overrides,
})

const connected = () => [
    { id: "opencode", integrationId: "ai_opencode", name: "OpenCode", configured: true, connected: true },
    { id: "gemini", integrationId: "ai_gemini", name: "Gemini", configured: true, connected: true },
    { id: "jev", integrationId: "ai_jev", name: "JEV", configured: true, connected: true },
]

beforeEach(() => {
    vi.clearAllMocks()
    mocks.doc = null
    mocks.statuses.mockResolvedValue(connected())
    mocks.models.mockResolvedValue([{ id: "gemini-3-flash", name: "Flash", variants: [], group: null, contextWindow: null, free: false }])
    mocks.agents.mockResolvedValue([])
})

describe('schema de "Tags de tarefas"', () => {
    it("ativada exige provedor, modelo e ao menos uma tag na taxonomia", () => {
        const result = taskTagsSettingsSchema.safeParse({ ...DEFAULT_TASK_TAGS_SETTINGS, enabled: true, taxonomy: [] })
        expect(result.success).toBe(false)
        expect(result.error?.issues.map((issue) => issue.message)).toEqual(["Selecione o provedor", "Selecione o modelo", "Adicione ao menos uma tag à taxonomia"])
    })

    it("recusa ids repetidos na taxonomia", () => {
        const result = taskTagsSettingsSchema.safeParse(settings({ taxonomy: [{ id: "a", label: "A" }, { id: "a", label: "B" }] }))
        expect(result.success).toBe(false)
        expect(result.error?.issues.some((issue) => issue.message === "Identificador repetido")).toBe(true)
    })

    it("desativada aceita vazio", () => {
        expect(taskTagsSettingsSchema.safeParse(DEFAULT_TASK_TAGS_SETTINGS).success).toBe(true)
    })
})

describe("configuração e disponibilidade", () => {
    it("sem nada salvo, devolve os valores iniciais (desativada) e explica o motivo", async () => {
        const dto = await getTaskTagsSettings()
        expect(dto).toMatchObject({ isDefault: true, settings: DEFAULT_TASK_TAGS_SETTINGS, availability: { available: false } })
        expect(dto.availability.reason).toContain("desativada")
    })

    it("disponível com provedor de texto conectado", async () => {
        expect(await availabilityOfTaskTags(settings())).toEqual({ available: true, reason: null })
        expect((await availabilityOfTaskTags(settings({ model: null }))).reason).toContain("provedor e o modelo")
    })

    it("disponível com o JEV conectado (decisão estruturada)", async () => {
        expect(await availabilityOfTaskTags(settings({ provider: "jev", model: "jev-latest" }))).toEqual({ available: true, reason: null })
    })

    it("normaliza a taxonomia (slug/dedupe) e zera campos que não se aplicam ao provedor (gemini)", () => {
        const next = normalizeTaskTagsSettings(
            settings({ agent: "x", variant: "high", taxonomy: [{ id: "", label: "Frontend" }, { id: "FRONTEND", label: "Front" }] }),
        )
        expect(next.taxonomy).toEqual([{ id: "frontend", label: "Frontend" }])
        expect(next.agent).toBeNull()
    })
})

describe("salvar", () => {
    it("confere o catálogo, grava, audita e avisa as telas", async () => {
        await saveTaskTagsSettings(settings(), "local")
        expect(mocks.updateOne).toHaveBeenCalledWith(
            { feature: "task-tags" },
            expect.objectContaining({ $set: expect.objectContaining({ settings: expect.objectContaining({ provider: "gemini" }), updatedBy: "local" }) }),
            { upsert: true },
        )
        expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entidade: "FeatureIA", entidadeId: "task-tags", acao: "CRIAR" }))
        expect(mocks.publish).toHaveBeenCalledWith("ai-feature-updated", { feature: "task-tags" })
    })

    it("modelo inexistente é recusado sem gravar", async () => {
        await expect(saveTaskTagsSettings(settings({ model: "x/y" }), "local")).rejects.toMatchObject({ code: "AI_MODEL_NOT_FOUND" })
        expect(mocks.updateOne).not.toHaveBeenCalled()
    })
})
