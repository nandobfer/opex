import { describe, expect, it } from "vitest"
import { MAX_ATTACHMENTS } from "@/features/evolution-api/chat-media-rules"
import { draftsFromFiles } from "@/features/secretary-agent/chat-attachments"

const file = (name: string, type: string, size = 10) => new File([new Uint8Array(size)], name, { type })

describe("anexos da aba Conversas (OPE-197)", () => {
    it("aceita foto e vídeo em Fotos e vídeos e recusa o que o WhatsApp não aceita, com a mensagem em pt-BR", () => {
        const { drafts, errors } = draftsFromFiles([file("a.png", "image/png"), file("v.mp4", "video/mp4"), file("f.heic", "image/heic")], "media")
        expect(drafts.map((draft) => [draft.file.name, draft.mediaType])).toEqual([["a.png", "image"], ["v.mp4", "video"]])
        expect(errors).toHaveLength(1)
        expect(errors[0]).toMatch(/^“f\.heic”.*WhatsApp/)
    })

    it("soltar ou colar um documento sem escolher o tipo vira documento (inclusive sem MIME do navegador)", () => {
        const { drafts, errors } = draftsFromFiles([file("nota.pdf", "application/pdf"), file("planilha.xlsx", "")])
        expect(errors).toEqual([])
        expect(drafts.map((draft) => draft.mediaType)).toEqual(["document", "document"])
        expect(drafts[1]!.mimeType).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    })

    it("em Documento, foto é recusada", () => {
        const { drafts, errors } = draftsFromFiles([file("a.png", "image/png")], "document")
        expect(drafts).toEqual([])
        expect(errors[0]).toContain("não é um documento aceito")
    })

    it(`limite de ${MAX_ATTACHMENTS} por envio, contando os que já estão na prévia`, () => {
        const files = Array.from({ length: 5 }, (_, index) => file(`${index}.png`, "image/png"))
        const { drafts, errors } = draftsFromFiles(files, "media", MAX_ATTACHMENTS - 2)
        expect(drafts).toHaveLength(2)
        expect(errors).toEqual([`Envie no máximo ${MAX_ATTACHMENTS} arquivos por vez.`])
    })
})
