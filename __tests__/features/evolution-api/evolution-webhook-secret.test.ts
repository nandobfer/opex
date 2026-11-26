import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
    doc: null as { secretValues: Record<string, unknown> } | null,
    sent: vi.fn(),
    sendText: vi.fn(async () => ({ key: { id: "TESTE1" } })),
}))

vi.mock("@/lib/crypto/secretBox", () => ({ encryptSecret: (value: string) => ({ box: value }) }))
vi.mock("@/lib/db", () => ({ AcaoAuditoria: { ATUALIZAR: "ATUALIZAR", EXECUTAR: "EXECUTAR" }, dbConnect: vi.fn(), recordAudit: vi.fn() }))
vi.mock("@/lib/integrations/store", () => ({ invalidateStoredIntegrations: vi.fn() }))
vi.mock("@/lib/integrations/config", () => ({
    getIntegrationConfig: async () => {
        // Simula a leitura no banco com uma pausa (dá chance de as duas chamadas correrem juntas).
        await new Promise((resolve) => setTimeout(resolve, 1))
        const box = mocks.doc?.secretValues.webhookSecret as { box: string } | undefined
        return { webhookSecret: box?.box, defaultInstance: "opex" }
    },
}))
vi.mock("@/lib/db/models/Integration", () => ({
    Integration: {
        updateOne: async (filter: Record<string, unknown>, update: { $setOnInsert?: Record<string, unknown>; $set?: Record<string, unknown> }) => {
            if (update.$setOnInsert) {
                mocks.doc ??= { secretValues: {} }
                return { modifiedCount: 0 }
            }
            const absent = mocks.doc && (mocks.doc.secretValues.webhookSecret === undefined || mocks.doc.secretValues.webhookSecret === null)
            if (!filter.$or || !absent) return { modifiedCount: 0 }
            mocks.doc!.secretValues.webhookSecret = update.$set!["secretValues.webhookSecret"]
            return { modifiedCount: 1 }
        },
    },
}))
vi.mock("@/features/evolution-api/server/client", () => ({ evolution: { sendText: mocks.sendText }, toDomainError: (error: unknown) => { throw error } }))
vi.mock("@/features/evolution-api/server/shared", () => ({ AcaoAuditoria: { EXECUTAR: "EXECUTAR" }, auditEvolution: vi.fn(), evolutionLog: { info: vi.fn() }, publishEvolution: vi.fn() }))
vi.mock("@/features/evolution-api/server/instances", () => ({ defaultInstanceName: async () => "opex" }))
vi.mock("@/features/evolution-api/server/webhook", () => ({ upsertContacts: vi.fn() }))
vi.mock("@/features/secretary-agent/server/models", () => ({ secretaryDb: vi.fn(), SecretarySent: { updateOne: mocks.sent } }))

import { ensureWebhookSecret } from "@/features/evolution-api/server/webhook-secret"
import { sendTestMessage } from "@/features/evolution-api/server/contacts"

beforeEach(() => {
    vi.clearAllMocks()
    mocks.doc = null
})

describe("segredo do webhook", () => {
    it("duas chamadas ao mesmo tempo terminam com um único segredo", async () => {
        const [a, b] = await Promise.all([ensureWebhookSecret("local"), ensureWebhookSecret("local")])
        expect(a).toBe(b)
        expect(a).toBe((mocks.doc!.secretValues.webhookSecret as { box: string }).box)
    })

    it("com outra instância do app gravando antes, usa o segredo vencedor", async () => {
        mocks.doc = { secretValues: {} }
        const racing = ensureWebhookSecret("local")
        mocks.doc.secretValues.webhookSecret = { box: "vencedor" }
        expect(await racing).toBe("vencedor")
    })

    it("segredo já existente não é trocado", async () => {
        mocks.doc = { secretValues: { webhookSecret: { box: "antigo" } } }
        expect(await ensureWebhookSecret("local")).toBe("antigo")
    })
})

describe("mensagem de teste", () => {
    it("fica registrada como envio do Opex (não pausa a conversa ao voltar como fromMe)", async () => {
        await sendTestMessage({ number: "5531999999999", text: "teste" }, "local")
        expect(mocks.sent).toHaveBeenCalledWith({ _id: "opex:TESTE1" }, expect.anything(), { upsert: true })
    })
})
