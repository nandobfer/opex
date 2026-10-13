import { describe, expect, it } from "vitest"
import {
    attachmentContentPath,
    attachmentKindOf,
    attachmentMarkdown,
    fallbackAttachmentName,
    formatAttachmentSize,
    isAttachmentReferenced,
    isInlineAttachmentMime,
    parseAttachmentUrl,
    safeAttachmentName,
} from "@/lib/attachments"

const ID = "a".repeat(24)

describe("contrato dos anexos", () => {
    it("deriva o tipo de exibição do mime", () => {
        expect(attachmentKindOf("image/png")).toBe("image")
        expect(attachmentKindOf("image/jpeg; charset=binary")).toBe("image")
        expect(attachmentKindOf("video/mp4")).toBe("video")
        expect(attachmentKindOf("audio/mpeg")).toBe("audio")
        expect(attachmentKindOf("application/pdf")).toBe("file")
        expect(attachmentKindOf(null)).toBe("file")
    })

    it("nunca trata SVG como imagem inline (conteúdo ativo)", () => {
        expect(attachmentKindOf("image/svg+xml")).toBe("file")
        expect(isInlineAttachmentMime("image/svg+xml")).toBe(false)
        expect(isInlineAttachmentMime("image/png")).toBe(true)
        expect(isInlineAttachmentMime("application/zip")).toBe(false)
    })

    it("monta a referência estável de Markdown por tipo", () => {
        expect(attachmentMarkdown({ id: ID, name: "foto.png", mimeType: "image/png" })).toBe(`![foto.png](${attachmentContentPath(ID)})`)
        expect(attachmentMarkdown({ id: ID, name: "clip.mp4", mimeType: "video/mp4" })).toBe(`![clip.mp4](${attachmentContentPath(ID)}#video)`)
        expect(attachmentMarkdown({ id: ID, name: "som.mp3", mimeType: "audio/mpeg" })).toBe(`![som.mp3](${attachmentContentPath(ID)}#audio)`)
        expect(attachmentMarkdown({ id: ID, name: "contrato.pdf", mimeType: "application/pdf" })).toBe(`[contrato.pdf](${attachmentContentPath(ID)})`)
    })

    it("reconhece a URL do anexo com e sem o subcaminho público", () => {
        expect(parseAttachmentUrl(attachmentContentPath(ID))).toEqual({ id: ID, media: null })
        expect(parseAttachmentUrl(`/dev/app${attachmentContentPath(ID)}#video`)).toEqual({ id: ID, media: "video" })
        expect(parseAttachmentUrl("https://exemplo.com/foto.png")).toBeNull()
        expect(parseAttachmentUrl(null)).toBeNull()
    })

    it("higieniza o nome e formata o tamanho", () => {
        expect(safeAttachmentName("../../etc/passwd")).toBe("passwd")
        expect(safeAttachmentName("   ")).toBe("arquivo")
        expect(formatAttachmentSize(0)).toBe("0 B")
        expect(formatAttachmentSize(2048)).toBe("2 KB")
        expect(formatAttachmentSize(1024 * 1024 * 3.5)).toBe("3,5 MB")
    })

    it("dá um nome padrão para a mídia colada, que chega sem nome", () => {
        expect(fallbackAttachmentName("image/png")).toBe("imagem-colada.png")
        expect(fallbackAttachmentName("image/jpeg")).toBe("imagem-colada.jpeg")
        expect(fallbackAttachmentName("video/mp4")).toBe("video-colado.mp4")
        expect(fallbackAttachmentName("audio/mpeg")).toBe("audio-colado.mpeg")
        expect(fallbackAttachmentName("application/pdf")).toBe("arquivo-colado.pdf")
        // Sem extensão útil (mime genérico ou ausente), o nome fica só com a base.
        expect(fallbackAttachmentName("application/octet-stream")).toBe("arquivo-colado")
        expect(fallbackAttachmentName("image/png; charset=binary")).toBe("imagem-colada.png")
        expect(fallbackAttachmentName(null)).toBe("arquivo-colado")
    })

    it("detecta o anexo referenciado na descrição", () => {
        expect(isAttachmentReferenced(`veja ![x](${attachmentContentPath(ID)})`, ID)).toBe(true)
        expect(isAttachmentReferenced("sem anexo", ID)).toBe(false)
        expect(isAttachmentReferenced(null, ID)).toBe(false)
    })
})
