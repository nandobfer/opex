import { describe, expect, it } from "vitest"
import { buildChatMessages, chatMessagePreview, chatStatusOf, vcardNumber } from "@/features/evolution-api/chat-message"
import type { EvolutionMessage } from "@/features/evolution-api/evolution-dto"

const jid = "5531999999999@s.whatsapp.net"
let ts = 1_790_000_000
const raw = (id: string, message: Record<string, unknown>, extra: Partial<EvolutionMessage> = {}): EvolutionMessage =>
    ({ key: { id, remoteJid: jid, fromMe: false }, message, messageTimestamp: (ts += 10), ...extra }) as EvolutionMessage

describe("buildChatMessages (aba Conversas, OPE-197)", () => {
    it("texto e mídias com nome, duração e voz, mais antigas primeiro", () => {
        const [audio, text, doc] = buildChatMessages([
            raw("A", { audioMessage: { mimetype: "audio/ogg", seconds: 7, ptt: true } }, { messageTimestamp: 100 }),
            raw("T", { conversation: "oi" }, { messageTimestamp: 200 }),
            raw("D", { documentWithCaptionMessage: { message: { documentMessage: { fileName: "nota.pdf", mimetype: "application/pdf", caption: "segue" } } } }, { messageTimestamp: 300 }),
        ])
        expect(audio).toMatchObject({ id: "A", kind: "audio", media: { kind: "audio", seconds: 7, voice: true } })
        expect(text).toMatchObject({ id: "T", kind: "text", text: "oi" })
        expect(doc).toMatchObject({ kind: "document", text: "segue", media: { fileName: "nota.pdf", mimetype: "application/pdf" } })
        expect(chatMessagePreview(audio!)).toBe("Mensagem de voz")
    })

    it("citação com o trecho e o autor", () => {
        const [reply] = buildChatMessages([raw("R", { extendedTextMessage: { text: "sim", contextInfo: { stanzaId: "Q1", participant: "5521988887777@s.whatsapp.net", quotedMessage: { conversation: "vem amanhã?" } } } })])
        expect(reply!.quoted).toEqual({ id: "Q1", text: "vem amanhã?", author: "5521988887777@s.whatsapp.net" })
    })

    it("reações agregadas na mensagem alvo: a última de cada autor vale e a vazia remove", () => {
        const items = buildChatMessages([
            raw("M", { conversation: "olá" }),
            raw("R1", { reactionMessage: { key: { id: "M" }, text: "👍" } }),
            raw("R2", { reactionMessage: { key: { id: "M" }, text: "❤️" } }, { key: { id: "R2", remoteJid: jid, fromMe: true } } as Partial<EvolutionMessage>),
            raw("R3", { reactionMessage: { key: { id: "M" }, text: "" } }, { key: { id: "R3", remoteJid: jid, fromMe: true } } as Partial<EvolutionMessage>),
        ])
        expect(items).toHaveLength(1)
        expect(items[0]!.reactions).toEqual([{ emoji: "👍", fromMe: false, author: null }])
    })

    it("edição aplicada e revogada vira \"Mensagem apagada\"; registros técnicos somem", () => {
        const items = buildChatMessages([
            raw("E", { conversation: "errado" }),
            raw("X", { conversation: "segredo" }),
            raw("P1", { protocolMessage: { type: "MESSAGE_EDIT", key: { id: "E" }, editedMessage: { conversation: "certo" } } }),
            raw("P2", { protocolMessage: { type: "REVOKE", key: { id: "X" } } }),
            raw("S", { senderKeyDistributionMessage: {} }),
        ])
        expect(items.map((item) => [item.id, item.kind, item.text, item.edited])).toEqual([["E", "text", "certo", true], ["X", "deleted", "", false]])
        expect(chatMessagePreview(items[1]!)).toBe("Mensagem apagada")
    })

    it("localização, contato (vCard) e status da Evolution", () => {
        const [location, contact] = buildChatMessages([
            raw("L", { locationMessage: { degreesLatitude: -19.9, degreesLongitude: -43.9, name: "Escritório" } }, { status: "READ" } as Partial<EvolutionMessage>),
            raw("C", { contactMessage: { displayName: "Ana", vcard: "BEGIN:VCARD\nTEL;type=CELL;waid=5531988887777:+55 31 98888-7777\nEND:VCARD" } }),
        ])
        expect(location).toMatchObject({ kind: "location", location: { latitude: -19.9, longitude: -43.9, name: "Escritório" }, status: "read" })
        expect(contact).toMatchObject({ kind: "contact", contacts: [{ name: "Ana", number: "5531988887777" }] })
        expect([chatStatusOf("SERVER_ACK"), chatStatusOf("DELIVERY_ACK"), chatStatusOf("ERROR"), chatStatusOf(undefined)]).toEqual(["sent", "delivered", "failed", null])
        expect(vcardNumber("TEL:+55 (31) 3333-4444")).toBe("553133334444")
    })
})
