import { beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ doc: null as null | { settings: Record<string, unknown>; updatedAt: Date } }))
vi.mock("@/lib/db", () => ({ dbConnect: vi.fn(), recordAudit: vi.fn(), AcaoAuditoria: { CRIAR: "CRIAR", ATUALIZAR: "ATUALIZAR" } }))
vi.mock("@/lib/db/models/Ai", () => ({
    AiFeatureSetting: { findOne: () => ({ lean: async () => mocks.doc }), updateOne: vi.fn() },
}))
vi.mock("@/lib/ai/catalog", () => ({ getAiProviderStatuses: vi.fn(), listAiModels: vi.fn(), listAiAgents: vi.fn() }))
vi.mock("@/lib/pusher/channels", () => ({ publishAppEvent: vi.fn() }))
vi.mock("@/lib/after-response", () => ({ runAfterResponse: vi.fn() }))
import { loadEnvironmentSettings } from "@/features/ai/server/settings"
import { DEFAULT_ENVIRONMENT_SETTINGS } from "@/features/environments/schemas"

beforeEach(() => {
    mocks.doc = null
})

describe("configuração da Administração de sistema", () => {
    it("chaves da entrega por HTTP (versão anterior) não desligam o módulo salvo", async () => {
        mocks.doc = {
            settings: {
                ...DEFAULT_ENVIRONMENT_SETTINGS,
                enabled: true,
                model: "opencode/model",
                agentBaseUrl: "http://127.0.0.1",
                accessTokenTtlMinutes: 30,
            },
            updatedAt: new Date(),
        }
        const { settings, isDefault } = await loadEnvironmentSettings()
        expect(isDefault).toBe(false)
        expect(settings).toMatchObject({ enabled: true, model: "opencode/model" })
        expect(settings).not.toHaveProperty("agentBaseUrl")
    })
    it("chave desconhecida de outra origem continua invalidando (schema estrito)", async () => {
        mocks.doc = { settings: { ...DEFAULT_ENVIRONMENT_SETTINGS, enabled: true, outra: 1 }, updatedAt: new Date() }
        expect((await loadEnvironmentSettings()).isDefault).toBe(true)
    })
})
