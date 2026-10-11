import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ config: vi.fn(), fetch: vi.fn(), create: vi.fn(), connect: vi.fn(), audit: vi.fn(), publish: vi.fn(), warn: vi.fn() }))
vi.mock("@/lib/integrations/config", () => ({ getIntegrationConfig: mocks.config }))
vi.mock("@/lib/integrations/debug", () => ({ integrationDebug: () => ({}), debugFetch: mocks.fetch }))
vi.mock("@/lib/db", () => ({ dbConnect: mocks.connect }))
vi.mock("@/lib/db/models/Ai", () => ({ AiUsageLog: { create: mocks.create } }))
vi.mock("@/lib/audit/record", () => ({ recordAudit: mocks.audit, AcaoAuditoria: { CRIAR: "CRIAR" } }))
vi.mock("@/lib/pusher/channels", () => ({ publishAppEvent: mocks.publish }))
vi.mock("@/lib/logger", () => ({ loggerFor: () => ({ warn: mocks.warn }) }))

import { askJevSystemOne, listJevModels } from "@/lib/ai/jev"

const input = { model: "jev-latest", tracking: { feature: "task-tags", subject: "task-1" }, state: "conteúdo privado", questions: { tag: { type: "noul" as const, instructions: "É uma tag?" } } }
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

beforeEach(() => {
    vi.clearAllMocks()
    mocks.config.mockResolvedValue({ apiKey: "segredo" })
    mocks.create.mockResolvedValue({ _id: "usage-1" })
    mocks.fetch.mockResolvedValue(response({ model: "jev-1.13.0", answers: { tag: { type: "noul", noul: 0.9 } }, usage: { input_tokens: 100, output_tokens: 20 } }))
})

describe("registro centralizado de requisições JEV", () => {
    it("persiste uso uma única vez com modelo efetivo, audita e só depois publica", async () => {
        const result = await askJevSystemOne(input)
        expect(result.answers?.tag).toEqual({ type: "noul", noul: 0.9 })
        expect(mocks.create).toHaveBeenCalledOnce()
        expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ feature: "task-tags", subject: "task-1", provider: "jev", model: "jev-1.13.0", inputTokens: 100, outputTokens: 20, totalTokens: 120, usageSource: "api", inputPricePerMillionUsd: 0.042, ok: true, error: null }))
        expect(mocks.create.mock.calls[0]![0].costUsd).toBeCloseTo(0.0000042, 12)
        expect(mocks.connect.mock.invocationCallOrder[0]).toBeLessThan(mocks.create.mock.invocationCallOrder[0]!)
        expect(mocks.create.mock.invocationCallOrder[0]).toBeLessThan(mocks.audit.mock.invocationCallOrder[0]!)
        expect(mocks.audit.mock.invocationCallOrder[0]).toBeLessThan(mocks.publish.mock.invocationCallOrder[0]!)
        expect(mocks.publish).toHaveBeenCalledWith("jev-usage-updated", { provider: "jev" })
        expect(JSON.stringify(mocks.create.mock.calls)).not.toContain("conteúdo privado")
        expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("segredo")
    })

    it("persiste o uso antes de devolver, mesmo quando o consumidor falha depois", async () => {
        await expect((async () => {
            await askJevSystemOne({ ...input, tracking: { feature: "estimate-hours", subject: "client:draft" } })
            throw new Error("Falha ao salvar estimativa")
        })()).rejects.toThrow("Falha ao salvar estimativa")
        expect(mocks.create).toHaveBeenCalledOnce()
        expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ feature: "estimate-hours", subject: "client:draft", totalTokens: 120 }))
    })

    it("resposta sem answers preserva tokens recebidos e registra falha", async () => {
        mocks.fetch.mockResolvedValue(response({ usage: { input_tokens: 10, output_tokens: 1 } }))
        await expect(askJevSystemOne(input)).rejects.toThrow("não devolveu respostas")
        expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ ok: false, totalTokens: 11, error: "O JEV não devolveu respostas" }))
    })

    it("falha de rede registra métricas desconhecidas sem ocultar o erro", async () => {
        mocks.fetch.mockRejectedValue(new Error("offline"))
        await expect(askJevSystemOne(input)).rejects.toThrow("offline")
        expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ ok: false, inputTokens: null, outputTokens: null, totalTokens: null, costUsd: null, model: "jev-latest" }))
    })

    it("sem usage registra chamada bem sucedida mas não inventa consumo", async () => {
        mocks.fetch.mockResolvedValue(response({ answers: {} }))
        await askJevSystemOne({ ...input, tracking: { feature: "task-tags", subject: null } })
        expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ ok: true, subject: null, totalTokens: null, costUsd: null }))
    })

    it("erro de persistência não impede a resposta nem publica evento", async () => {
        mocks.create.mockRejectedValueOnce(new Error("banco indisponível"))
        expect((await askJevSystemOne(input)).answers).toBeTruthy()
        expect(mocks.warn).toHaveBeenCalledOnce()
        expect(mocks.publish).not.toHaveBeenCalled()
    })

    it("erro HTTP registra falha; catálogo de modelos não gera usage", async () => {
        mocks.fetch.mockResolvedValueOnce(response({}, 401))
        await expect(askJevSystemOne(input)).rejects.toThrow("API key")
        expect(mocks.create).toHaveBeenCalledOnce()
        mocks.create.mockClear()
        mocks.fetch.mockResolvedValueOnce(response({ models: [] }))
        await listJevModels()
        expect(mocks.create).not.toHaveBeenCalled()
    })
})
