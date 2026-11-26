import { describe, expect, it } from "vitest"
import { validateMediaFile } from "@/features/evolution-api/chat-media-rules"

const MB = 1024 * 1024

describe("regras de arquivo da aba Conversas (OPE-197)", () => {
    it("aceita foto, vídeo, documento pela extensão e a voz gravada no navegador", () => {
        expect(validateMediaFile({ mimeType: "image/png", fileName: "a.png", size: 10 })).toMatchObject({ ok: true, mediaType: "image" })
        expect(validateMediaFile({ mimeType: "video/mp4", fileName: "v.mp4", size: 10 })).toMatchObject({ ok: true, mediaType: "video" })
        expect(validateMediaFile({ mimeType: "", fileName: "planilha.xlsx", size: 10 }, "document")).toMatchObject({ ok: true, mediaType: "document" })
        expect(validateMediaFile({ mimeType: "audio/webm;codecs=opus", fileName: "voz.webm", size: 10 }, "audio")).toMatchObject({ ok: true, mediaType: "audio", mimeType: "audio/webm" })
    })

    it("recusa com mensagem em pt-BR: imagem fora de JPG/PNG, foto em Documento, vazio e acima do limite", () => {
        expect(validateMediaFile({ mimeType: "image/heic", fileName: "f.heic", size: 10 })).toEqual({ ok: false, message: "“f.heic”: o WhatsApp só aceita fotos JPG ou PNG." })
        expect(validateMediaFile({ mimeType: "image/png", fileName: "a.png", size: 10 }, "document")).toMatchObject({ ok: false, message: expect.stringContaining("não é um documento aceito") })
        expect(validateMediaFile({ mimeType: "image/png", fileName: "a.png", size: 0 })).toEqual({ ok: false, message: "“a.png” está vazio." })
        expect(validateMediaFile({ mimeType: "image/jpeg", fileName: "g.jpg", size: 6 * MB })).toMatchObject({ ok: false, message: expect.stringContaining("o limite para imagem é 5,0 MB") })
    })
})
