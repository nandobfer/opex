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

import { DEFAULT_TASK_REFINEMENT_SETTINGS, taskRefinementSettingsSchema, type TaskRefinementSettings } from "@/features/ai/schemas"
import { availabilityOfTaskRefinement, getTaskRefinementSettings, normalizeTaskRefinementSettings, saveTaskRefinementSettings } from "@/features/ai/server/settings"

const settings = (overrides: Partial<TaskRefinementSettings> = {}): TaskRefinementSettings => ({
    ...DEFAULT_TASK_REFINEMENT_SETTINGS,
    enabled: true,
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
    mocks.agents.mockResolvedValue([{ id: "plan", name: "Plan", description: null }])
})

describe('schema de "Refinar tarefa"', () => {
    it("ativada exige modelo; desativada aceita vazio", () => {
        const result = taskRefinementSettingsSchema.safeParse({ ...DEFAULT_TASK_REFINEMENT_SETTINGS, enabled: true })
        expect(result.success).toBe(false)
        expect(result.error?.issues.map((issue) => issue.message)).toEqual(["Selecione o modelo"])
        expect(taskRefinementSettingsSchema.safeParse(DEFAULT_TASK_REFINEMENT_SETTINGS).success).toBe(true)
    })
})

describe("configuração e disponibilidade", () => {
    it("sem nada salvo, devolve os valores iniciais (desativada) e explica o motivo", async () => {
        const dto = await getTaskRefinementSettings()
        expect(dto).toMatchObject({ isDefault: true, settings: DEFAULT_TASK_REFINEMENT_SETTINGS, availability: { available: false } })
        expect(dto.availability.reason).toContain("desativada")
    })

    it("disponível só com a feature ativa, modelo escolhido e OpenCode conectado", async () => {
        expect(await availabilityOfTaskRefinement(settings())).toEqual({ available: true, reason: null })
        expect((await availabilityOfTaskRefinement(settings({ model: null }))).reason).toContain("provedor e o modelo")
        mocks.statuses.mockResolvedValue(connected({ connected: false }))
        expect((await availabilityOfTaskRefinement(settings())).reason).toContain("OpenCode não está conectado")
    })

    it("normaliza agente e variante vazios para null", () => {
        expect(normalizeTaskRefinementSettings(settings({ agent: "", variant: "" }))).toMatchObject({ agent: null, variant: null })
    })
})

describe("salvar", () => {
    it("confere o catálogo do OpenCode, grava, audita e avisa as telas", async () => {
        await saveTaskRefinementSettings(settings({ agent: "plan", variant: "high" }), "local")
        expect(mocks.updateOne).toHaveBeenCalledWith(
            { feature: "task-refinement" },
            expect.objectContaining({ $set: expect.objectContaining({ settings: expect.objectContaining({ agent: "plan", variant: "high", include: { comments: true, history: true } }), updatedBy: "local" }) }),
            { upsert: true },
        )
        expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entidade: "FeatureIA", entidadeId: "task-refinement", acao: "CRIAR" }))
        expect(mocks.publish).toHaveBeenCalledWith("ai-feature-updated", { feature: "task-refinement" })
    })

    it("modelo/variante/agente inexistentes são recusados sem gravar", async () => {
        await expect(saveTaskRefinementSettings(settings({ model: "x/y" }), "local")).rejects.toMatchObject({ code: "AI_MODEL_NOT_FOUND" })
        await expect(saveTaskRefinementSettings(settings({ variant: "max" }), "local")).rejects.toMatchObject({ code: "AI_VARIANT_NOT_FOUND" })
        await expect(saveTaskRefinementSettings(settings({ agent: "build" }), "local")).rejects.toMatchObject({ code: "AI_AGENT_NOT_FOUND" })
        expect(mocks.updateOne).not.toHaveBeenCalled()
    })
})
