import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
    stored: false,
    vars: [
        { key: "AUTHENTICATION_API_KEY", value: "chave-super-secreta" },
        { key: "SERVER_URL", value: "https://evolution.nandoburgos.dev" },
        { key: "EVOLUTION_VERSION", value: "2.3.8" },
    ],
    update: vi.fn(async (_id: string, input: unknown) => ({ id: "evolution-api", input })),
}))

vi.mock("@/lib/integrations/config", () => ({ getIntegration: async () => ({ stored: mocks.stored, values: {}, secretSources: {} }) }))
vi.mock("@/features/environments/server/service", () => ({ resolveEnvironmentRef: async () => ({ id: "env" }), envVarsOf: () => mocks.vars }))
vi.mock("@/features/integrations/services/integration-service", () => ({ updateIntegration: mocks.update, IntegrationUpdateError: class extends Error {} }))
vi.mock("@/lib/db", () => ({ AcaoAuditoria: {}, dbConnect: vi.fn(), recordAudit: vi.fn() }))
vi.mock("@/lib/pusher/channels", () => ({ publishAppEvent: vi.fn() }))

import { applyEnvironmentKey, getEvolutionPrefill } from "@/features/evolution-api/server/prefill"

beforeEach(() => {
    vi.clearAllMocks()
    mocks.stored = false
})

describe("pré-preenchimento da Evolution API", () => {
    it("não devolve a chave ao navegador, só que ela existe", async () => {
        const dto = await getEvolutionPrefill()
        expect(dto).toMatchObject({ available: true, keyAvailable: true, publicUrl: "https://evolution.nandoburgos.dev", version: "2.3.8" })
        expect(JSON.stringify(dto)).not.toContain("chave-super-secreta")
    })

    it("com a integração já salva não lê o ambiente", async () => {
        mocks.stored = true
        expect(await getEvolutionPrefill()).toMatchObject({ available: false, configured: true, keyAvailable: false })
    })

    it("ao salvar, o servidor grava a chave lida do ambiente junto com o formulário", async () => {
        await applyEnvironmentKey({ publicValues: { internalUrl: "http://evolution-api:8080" } }, "local")
        expect(mocks.update).toHaveBeenCalledWith("evolution-api", { publicValues: { internalUrl: "http://evolution-api:8080" }, secrets: { apiKey: { action: "set", value: "chave-super-secreta" } } }, "local")
    })
})
