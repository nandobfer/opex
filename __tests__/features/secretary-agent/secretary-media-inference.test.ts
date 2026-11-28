import { beforeEach, describe, expect, it, vi } from "vitest"
import { MockLanguageModelV4 } from "ai/test"
import { APICallError, tool } from "ai"
import { z } from "zod"
import { DEFAULT_SECRETARY_SETTINGS, type SecretarySettings } from "@/features/secretary-agent/schemas"
import type { ParsedMessage } from "@/features/evolution-api/message"

const mocks = vi.hoisted(() => ({
    modalities: ["text", "image"] as string[] | undefined,
    mediaBase64: vi.fn(),
    consumption: vi.fn(),
    model: null as unknown,
}))

vi.mock("@nandobfer/integracoes/modules/integrations/ia/ai/catalog", () => ({ listAiModels: async () => [{ id: "m", inputModalities: mocks.modalities }] }))
vi.mock("@/features/evolution-api/server/client", () => ({ evolution: { mediaBase64: mocks.mediaBase64 } }))
vi.mock("@nandobfer/integracoes/modules/integrations/ia/ai/consumption", () => ({ recordAiConsumption: mocks.consumption }))
vi.mock("@nandobfer/integracoes/modules/integrations/ia/ai/stream", () => ({
    prepareModel: async () => ({ model: mocks.model, providerOptions: undefined, apiKeyId: "k1", takeStepCost: () => null, dispose: async () => undefined }),
}))

import { readTurnMedia } from "@/features/secretary-agent/server/media"
import { secretaryInference } from "@/features/secretary-agent/server/ai"

function settings(patch: Partial<SecretarySettings["media"]> = {}, provider: "opencode-go" | "anthropic" = "opencode-go"): SecretarySettings {
    return {
        ...DEFAULT_SECRETARY_SETTINGS,
        main: { ...DEFAULT_SECRETARY_SETTINGS.main, provider, model: "m" },
        media: { ...DEFAULT_SECRETARY_SETTINGS.media, ...patch },
        pricing: { "anthropic/m": { inputPerMTok: 1, outputPerMTok: 2 } },
    }
}
function msg(kind: "image" | "audio" | "document", text = ""): ParsedMessage {
    return { id: "M1", chatJid: "5531@s.whatsapp.net", fromMe: false, isGroup: false, participant: null, pushName: null, text, media: { kind, mimetype: `${kind}/x`, fileName: kind === "document" ? "nota.pdf" : null }, quotedId: null, quotedAuthor: null, mentioned: [], timestamp: new Date(), ignorable: false }
}
const usage = { inputTokens: { total: 1_000_000, noCache: 1_000_000, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 500_000, text: 500_000, reasoning: 0 } }
function toolStream(payload: unknown, toolName = "entregar") {
    return async () => ({ stream: new ReadableStream({ start(controller) {
        controller.enqueue({ type: "stream-start", warnings: [] })
        if (toolName) controller.enqueue({ type: "tool-call", toolCallId: toolName, toolName, input: JSON.stringify(payload) })
        controller.enqueue({ type: "finish", finishReason: { unified: toolName ? "tool-calls" : "stop", raw: "stop" }, usage })
        controller.close()
    } }) })
}
function jsonModel(payload: unknown) {
    return new MockLanguageModelV4({
        doStream: toolStream(payload),
    })
}

beforeEach(() => {
    vi.clearAllMocks()
    mocks.modalities = ["text", "image", "audio"]
    mocks.mediaBase64.mockResolvedValue({ base64: Buffer.from("x").toString("base64"), mimetype: "image/jpeg" })
    mocks.model = jsonModel({ text: "Foto de um bolo de aniversário" })
})

describe("readTurnMedia", () => {
    it("leitura desligada vira marcador e não chama a Evolution", async () => {
        expect(await readTurnMedia(settings({ readImages: false }), "opex", msg("image"), "T")).toEqual({ text: "[imagem]", understood: false })
        expect(await readTurnMedia(settings({ transcribeAudio: false }), "opex", msg("audio"), "T")).toEqual({ text: "[áudio]", understood: false })
        expect(mocks.mediaBase64).not.toHaveBeenCalled()
    })

    it("documento vira descrição curta com o nome", async () => {
        expect(await readTurnMedia(settings(), "opex", msg("document"), "T")).toEqual({ text: "[documento: nota.pdf]", understood: false })
    })

    it("modelo sem a modalidade vira marcador", async () => {
        mocks.modalities = ["text"]
        expect(await readTurnMedia(settings(), "opex", msg("image", "olha"), "T")).toEqual({ text: "[imagem] olha", understood: false })
        expect(mocks.mediaBase64).not.toHaveBeenCalled()
    })

    it("erro ao baixar a mídia vira marcador e o turno segue", async () => {
        mocks.mediaBase64.mockRejectedValueOnce(new Error("Evolution fora"))
        expect(await readTurnMedia(settings(), "opex", msg("image"), "T")).toEqual({ text: "[imagem]", understood: false })
    })

    it("com leitura ligada e modelo compatível, descreve a imagem pelo modelo", async () => {
        expect(await readTurnMedia(settings(), "opex", msg("image"), "T")).toEqual({ text: "[imagem]\nFoto de um bolo de aniversário", understood: true })
    })
})

describe("secretaryInference (SDK real, modelo fake)", () => {
    const infer = (tools?: Parameters<typeof secretaryInference>[0]["tools"]) => secretaryInference({ settings: settings({}, "anthropic"), model: { provider: "anthropic", model: "m", variant: null }, id: "t1", instructions: "x", messages: [{ role: "user", content: "oi" }], schema: z.object({ ok: z.boolean() }), tools })
    it("entrega o JSON Schema ao modelo, valida a resposta e grava o consumo estimado pela tabela", async () => {
        const model = jsonModel({ ok: true })
        mocks.model = model
        const result = await infer()
        expect(result).toEqual({ ok: true })
        const call = model.doStreamCalls[0]!
        expect(call.responseFormat?.type).not.toBe("json")
        expect(call.toolChoice).toEqual({ type: "required" })
        expect(call.tools).toContainEqual(expect.objectContaining({ name: "entregar", inputSchema: expect.objectContaining({ properties: { ok: { type: "boolean" } } }) }))
        // 1M de entrada a US$ 1 + 0,5M de saída a US$ 2 = US$ 2.
        expect(mocks.consumption).toHaveBeenCalledWith(expect.objectContaining({ provider: "anthropic", origin: "secretary-agent", costUsd: 2, apiKeyId: "k1", tokenDetails: { noCache: 1_000_000, cacheRead: 0, cacheWrite: 0, output: 500_000, reasoning: 0 } }))
    })

    it("resposta fora do schema falha (o turno registra erro em vez de enviar lixo)", async () => {
        mocks.model = jsonModel({ outro: 1 })
        await expect(infer()).rejects.toThrow("formato inválido")
    })

    it("uma entrega inválida volta ao modelo com o erro e a segunda, válida, é devolvida", async () => {
        const model = new MockLanguageModelV4({ doStream: [await toolStream({ ok: "talvez" })(), await toolStream({ ok: true })()] })
        mocks.model = model
        await expect(infer()).resolves.toEqual({ ok: true })
        expect(model.doStreamCalls).toHaveLength(2)
        expect(JSON.stringify(model.doStreamCalls[1]!.prompt)).toContain("tool-result")
    })

    it("depois de 8 passos inválidos, o erro aponta os campos sem repetir os valores", async () => {
        const model = jsonModel({ ok: "segredo-do-contato" })
        mocks.model = model
        const error = await infer().catch((reason: unknown) => reason as Error)
        expect(model.doStreamCalls).toHaveLength(8)
        expect(error.message).toBe("O modelo entregou uma resposta em formato inválido (campos: ok).")
        expect(error.message).not.toContain("segredo")
    })

    it("normaliza a entrega antes do schema estrito", async () => {
        mocks.model = jsonModel({ ok: "sim" })
        const result = await secretaryInference({ settings: settings({}, "anthropic"), model: { provider: "anthropic", model: "m", variant: null }, id: "t1", instructions: "x", messages: [{ role: "user", content: "oi" }],
            schema: z.object({ ok: z.boolean() }), deliverySchema: z.object({ ok: z.string() }), normalize: (raw) => ({ ok: (raw as { ok: string }).ok === "sim" }) })
        expect(result).toEqual({ ok: true })
    })

    it("executa a ferramenta de memória antes de entregar", async () => {
        const execute = vi.fn(async () => "gravado")
        mocks.model = new MockLanguageModelV4({ doStream: [await toolStream({}, "remember")(), await toolStream({ ok: true })()] })
        await expect(infer({ remember: tool({ inputSchema: z.object({}), execute }) })).resolves.toEqual({ ok: true })
        expect(execute).toHaveBeenCalledTimes(1)
        expect(mocks.consumption).toHaveBeenCalledTimes(2)
    })

    it("não inventa uma saída quando o modelo termina sem entregar", async () => {
        mocks.model = new MockLanguageModelV4({ doStream: toolStream({}, "") })
        await expect(infer()).rejects.toThrow("O modelo terminou sem entregar a resposta.")
    })

    it("preserva o erro original da API", async () => {
        const error = new APICallError({ message: "Bad Request", url: "https://example.test", requestBodyValues: {}, statusCode: 400, responseBody: '{"error":{"message":"response_format"}}' })
        mocks.model = new MockLanguageModelV4({ doStream: async () => { throw error } })
        await expect(infer()).rejects.toBe(error)
    })
})
