import { describe, expect, it } from "vitest"
import { mediaMarker, mentionsOwner, messageDisplayText, parseEvolutionMessage } from "@/features/evolution-api/message"
import { connectionOf, contactsOf, messagesOf, normalizeEventName, qrOf } from "@/features/evolution-api/webhook-parse"
import { prefillFromEnv } from "@/features/evolution-api/prefill"
import { connectionStateOf } from "@/features/evolution-api/constants"

const OWNER = "5531988887777@s.whatsapp.net"

describe("parseEvolutionMessage", () => {
    it("lê texto, citação e menções", () => {
        const parsed = parseEvolutionMessage({
            key: { id: "A1", remoteJid: "120363000000000001@g.us", fromMe: false, participant: "5531999999999:3@s.whatsapp.net" },
            pushName: "Ana",
            messageType: "extendedTextMessage",
            message: { extendedTextMessage: { text: "@5531988887777 viu?" } },
            contextInfo: { stanzaId: "Q1", participant: OWNER, mentionedJid: [OWNER] },
            messageTimestamp: 1_764_000_000,
        })
        expect(parsed).toMatchObject({ id: "A1", isGroup: true, participant: "5531999999999@s.whatsapp.net", text: "@5531988887777 viu?", quotedId: "Q1" })
        expect(mentionsOwner(parsed, OWNER)).toBe(true)
        expect(mentionsOwner({ ...parsed, mentioned: [], quotedAuthor: null, text: "oi" }, OWNER)).toBe(false)
    })

    it("mídia vira marcador e documento leva o nome", () => {
        const audio = parseEvolutionMessage({ key: { id: "B", remoteJid: "5531@s.whatsapp.net", fromMe: false }, messageType: "audioMessage", message: { audioMessage: { mimetype: "audio/ogg" } } })
        expect(messageDisplayText(audio)).toBe("[áudio]")
        expect(mediaMarker({ kind: "document", mimetype: null, fileName: "nota.pdf" })).toBe("[documento: nota.pdf]")
        expect(mediaMarker({ kind: "image", mimetype: null, fileName: null })).toBe("[imagem]")
    })

    it("@lid usa o número alternativo quando vem", () => {
        const parsed = parseEvolutionMessage({ key: { id: "C", remoteJid: "999@lid", remoteJidAlt: "5531999999999@s.whatsapp.net", fromMe: false }, message: { conversation: "oi" } })
        expect(parsed.chatJid).toBe("5531999999999@s.whatsapp.net")
    })
})

describe("webhook-parse", () => {
    it("normaliza nomes de evento", () => {
        expect(normalizeEventName("messages.upsert")).toBe("MESSAGES_UPSERT")
        expect(normalizeEventName("CONNECTION_UPDATE")).toBe("CONNECTION_UPDATE")
    })
    it("lê mensagens, contatos, conexão e QR", () => {
        expect(messagesOf({ key: { id: "1", remoteJid: "x@s.whatsapp.net" } })).toHaveLength(1)
        expect(contactsOf([{ remoteJid: "status@broadcast" }, { id: "1203@g.us", subject: "Família" }])).toEqual([{ jid: "1203@g.us", name: "Família", pushName: null, pictureUrl: null, isGroup: true }])
        expect(connectionOf({ state: "open", wuid: OWNER, profileName: "Fernando" })).toMatchObject({ state: "open", ownerJid: OWNER })
        expect(qrOf({ qrcode: { base64: "data:image/png;base64,AAA", code: "x" } })).toMatchObject({ base64: "data:image/png;base64,AAA", limitReached: false })
        expect(qrOf({ message: "QR code limit reached" })).toMatchObject({ limitReached: true })
        expect(connectionStateOf("connecting")).toBe("waiting")
    })
})

describe("prefillFromEnv", () => {
    it("monta os campos do ambiente sem devolver a chave", () => {
        const dto = prefillFromEnv(new Map([["AUTHENTICATION_API_KEY", "segredo-123"], ["SERVER_URL", "https://evolution.nandoburgos.dev/"], ["EVOLUTION_VERSION", "v2.3.8"]]), { configured: false, keyConfigured: false, port: "3100" })
        expect(dto).toMatchObject({ available: true, keyAvailable: true, internalUrl: "http://evolution-api:8080", publicUrl: "https://evolution.nandoburgos.dev", version: "2.3.8", webhookUrl: "http://opex-3100:3100/api/evolution/webhook" })
        expect(JSON.stringify(dto)).not.toContain("segredo-123")
    })
    it("sem ambiente devolve só os padrões", () => {
        expect(prefillFromEnv(null, { configured: false, keyConfigured: false })).toMatchObject({ available: false, keyAvailable: false, publicUrl: null })
    })
})
