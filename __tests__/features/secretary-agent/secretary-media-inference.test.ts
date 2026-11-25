import { beforeEach, describe, expect, it, vi } from "vitest"
import { MockLanguageModelV4 } from "ai/test"
import { z } from "zod"
import { DEFAULT_SECRETARY_SETTINGS, type SecretarySettings } from "@/features/secretary-agent/schemas"
import type { ParsedMessage } from "@/features/evolution-api/message"

const mocks = vi.hoisted(() => ({
    modalities: ["text", "image"] as string[] | undefined,
    mediaBase64: vi.fn(),
    consumption: vi.fn(),
    model: null as unknown,
}))

vi.mock("@/lib/ai/catalog", () => ({ listAiModels: async () => [{ id: "m", inputModalities: mocks.modalities }] }))
vi.mock("@/features/evolution-api/server/client", () => ({ evolution: { mediaBase64: mocks.mediaBase64 } }))
vi.mock("@/lib/ai/consumption", () => ({ recordAiConsumption: mocks.consumption }))
vi.mock("@/lib/ai/stream", () => ({
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
function jsonModel(payload: unknown) {
    return new MockLanguageModelV4({
        doGenerate: async () => ({
            content: [{ type: "text", text: JSON.stringify(payload) }],
            finishReason: { unified: "stop", raw: "stop" },
            usage: { inputTokens: { total: 1_000_000, noCache: 1_000_000, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 500_000, text: 500_000, reasoning: 0 } },
            warnings: [],
        }),
    } as ConstructorParameters<typeof MockLanguageModelV4>[0])
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
    it("entrega o JSON Schema ao modelo, valida a resposta e grava o consumo estimado pela tabela", async () => {
        const model = jsonModel({ ok: true })
        mocks.model = model
        const result = await secretaryInference({ settings: settings({}, "anthropic"), model: { provider: "anthropic", model: "m", variant: null }, id: "t1", instructions: "x", messages: [{ role: "user", content: "oi" }], schema: z.object({ ok: z.boolean() }) })
        expect(result).toEqual({ ok: true })
        const format = model.doGenerateCalls[0]!.responseFormat as { type: string; schema?: { properties?: Record<string, unknown> } }
        expect(format.type).toBe("json")
        expect(format.schema?.properties).toHaveProperty("ok")
        // 1M de entrada a US$ 1 + 0,5M de saída a US$ 2 = US$ 2.
        expect(mocks.consumption).toHaveBeenCalledWith(expect.objectContaining({ provider: "anthropic", origin: "secretary-agent", costUsd: 2, apiKeyId: "k1" }))
    })

    it("resposta fora do schema falha (o turno registra erro em vez de enviar lixo)", async () => {
        mocks.model = jsonModel({ outro: 1 })
        await expect(secretaryInference({ settings: settings(), model: { provider: "opencode-go", model: "m", variant: null }, id: "t2", instructions: "x", messages: [{ role: "user", content: "oi" }], schema: z.object({ ok: z.boolean() }) })).rejects.toThrow()
    })
})
