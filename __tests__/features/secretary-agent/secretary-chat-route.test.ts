import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_SECRETARY_SETTINGS } from "@/features/secretary-agent/schemas"

const mocks = vi.hoisted(() => ({
    evolution: {
        findMessages: vi.fn(),
        sendText: vi.fn(),
        sendReaction: vi.fn(),
        sendLocation: vi.fn(),
        sendContact: vi.fn(),
        sendMedia: vi.fn(),
        sendWhatsAppAudio: vi.fn(),
        mediaBase64: vi.fn(),
        markAsRead: vi.fn(),
    },
    audit: vi.fn(),
    decisions: vi.fn(),
    agentDecisions: vi.fn(),
    notices: vi.fn(),
    sent: vi.fn(),
    sentUpsert: vi.fn(),
    jids: vi.fn(),
}))
vi.mock("@/features/evolution-api/server/lid", () => ({ conversationJids: mocks.jids }))
vi.mock("@/features/auth/server/context", () => ({ requireAdminSession: vi.fn() }))
vi.mock("@/lib/db", () => ({ AcaoAuditoria: { EXECUTAR: "EXECUTAR" }, recordAudit: mocks.audit }))
vi.mock("@/features/evolution-api/server/client", () => ({ evolution: mocks.evolution, toDomainError: (error: unknown) => { throw error } }))
vi.mock("@/features/secretary-agent/server/settings", () => ({ loadSecretarySettings: async () => ({ settings: { ...DEFAULT_SECRETARY_SETTINGS, instance: "opex" } }) }))
const chain = (result: () => unknown) => {
    const query = { sort: () => query, limit: () => query, select: () => query, lean: async () => result() }
    return query
}
vi.mock("@/features/secretary-agent/server/models", () => ({
    secretaryDb: vi.fn(),
    SecretaryDecisionRecord: { find: (filter: { messageIds?: unknown }) => chain(() => (filter.messageIds ? mocks.agentDecisions(filter) : mocks.decisions(filter))) },
    SecretaryNotice: { find: (filter: unknown) => chain(() => mocks.notices(filter)) },
    SecretarySent: { find: (filter: unknown) => chain(() => mocks.sent(filter)), updateOne: mocks.sentUpsert },
}))

import { GET, POST } from "@/app/api/secretary/conversations/[chatId]/messages/route"
import { GET as MEDIA } from "@/app/api/secretary/conversations/[chatId]/messages/[messageId]/media/route"

const chatId = "5531999999999"
const jid = `${chatId}@s.whatsapp.net`
const params = { params: Promise.resolve({ chatId }) }
const post = (body: unknown) => POST(new NextRequest(`http://localhost/api/secretary/conversations/${chatId}/messages`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }), params)
const lid = "158879933534209@lid"
const record = (id: string, seconds: number, fromMe = false, remoteJid = jid) => ({ key: { id, remoteJid, fromMe }, message: { conversation: id }, messageTimestamp: seconds })
const get = (query = "") => GET(new NextRequest(`http://localhost/api/secretary/conversations/${chatId}/messages${query}`), params)

beforeEach(() => {
    vi.clearAllMocks()
    mocks.decisions.mockReturnValue([])
    mocks.agentDecisions.mockReturnValue([])
    mocks.notices.mockReturnValue([])
    mocks.sent.mockReturnValue([])
    mocks.jids.mockImplementation(async (_instance: string, value: string) => [value])
    for (const fn of [mocks.evolution.sendText, mocks.evolution.sendReaction, mocks.evolution.sendLocation, mocks.evolution.sendContact, mocks.evolution.sendMedia, mocks.evolution.sendWhatsAppAudio]) fn.mockResolvedValue({ key: { id: "NEW" } })
})

describe("GET mensagens da conversa (OPE-197)", () => {
    it("D3: página com as decisões a partir da mais antiga e os ids enviados pelo Secretário (turno, aviso e legado)", async () => {
        mocks.evolution.findMessages.mockResolvedValue({ total: 80, pages: 2, page: 1, records: [record("B", 1_790_000_200, true), record("A", 1_790_000_100), record("C", 1_790_000_300, true), record("D", 1_790_000_400, true)] })
        mocks.decisions.mockReturnValue([{ _id: "opex:A", decision: "replied", reason: "ok", at: new Date("2026-09-21T00:00:00Z") }])
        mocks.agentDecisions.mockReturnValue([{ messageIds: ["B", "fora-da-pagina"] }])
        mocks.notices.mockReturnValue([{ sentMessageId: "C" }])
        mocks.sent.mockReturnValue([{ _id: "opex:D" }])
        const response = await get()
        expect(response.status).toBe(200)
        const { data } = await response.json()
        expect(data.items.map((item: { id: string }) => item.id)).toEqual(["A", "B", "C", "D"])
        expect(data.hasOlder).toBe(true)
        expect(data.nextBefore).toBe(new Date(1_790_000_100 * 1000).toISOString())
        expect(data.decisions).toEqual([{ id: "opex:A", decision: "replied", reason: "ok", at: "2026-09-21T00:00:00.000Z" }])
        expect(new Set(data.agentMessageIds)).toEqual(new Set(["B", "C", "D"]))
        expect(mocks.decisions).toHaveBeenCalledWith({ instance: "opex", chatId, at: { $gte: new Date(1_790_000_100 * 1000) } })
        // A mensagem de teste da integração não leva o selo.
        expect(mocks.sent).toHaveBeenCalledWith(expect.objectContaining({ origin: { $ne: "test" } }))
    })

    it("D6: abrir a conversa nunca marca como lida no WhatsApp", async () => {
        mocks.evolution.findMessages.mockResolvedValue({ total: 1, pages: 1, page: 1, records: [record("A", 1_790_000_100)] })
        await get()
        expect(mocks.evolution.markAsRead).not.toHaveBeenCalled()
    })
})

describe("GET conversa endereçada por LID (OPE-207)", () => {
    it("regressão: a mensagem mais nova gravada só no @lid aparece junto das do número", async () => {
        mocks.jids.mockResolvedValue([jid, lid])
        mocks.evolution.findMessages.mockImplementation(async (_instance: string, input: { remoteJid: string }) =>
            input.remoteJid === lid
                ? { total: 2, pages: 1, page: 1, records: [record("NOVA", 1_790_000_900, false, lid), record("NOVA", 1_790_000_900, false, lid)] }
                : { total: 2, pages: 1, page: 1, records: [record("B", 1_790_000_200, true), record("A", 1_790_000_100)] },
        )
        const { data } = await (await get()).json()
        expect(mocks.evolution.findMessages.mock.calls.map(([, input]) => input.remoteJid)).toEqual([jid, lid])
        expect(data.items.map((item: { id: string }) => item.id)).toEqual(["A", "B", "NOVA"])
        expect(data.hasOlder).toBe(false)
        expect(data.nextBefore).toBeNull()
    })

    it("`antes` pede as anteriores ao cursor (inclusivo) nas duas metades", async () => {
        mocks.jids.mockResolvedValue([jid, lid])
        mocks.evolution.findMessages.mockResolvedValue({ total: 0, pages: 0, page: 1, records: [] })
        const before = "2026-09-21T10:00:00.000Z"
        expect((await get(`?antes=${encodeURIComponent(before)}`)).status).toBe(200)
        for (const [, input] of mocks.evolution.findMessages.mock.calls) expect(input).toEqual(expect.objectContaining({ from: new Date(0), to: new Date(before) }))
    })

    it("`antes` inválido devolve 400", async () => {
        expect((await get("?antes=ontem")).status).toBe(400)
        expect(mocks.evolution.findMessages).not.toHaveBeenCalled()
    })
})

describe("POST envio pelo dono (D1)", () => {
    it("texto com citação, reação, localização e contato chamam a Evolution e auditam sem o conteúdo", async () => {
        expect((await post({ type: "text", text: "segredo da conversa", quotedId: "Q" })).status).toBe(200)
        expect(mocks.evolution.sendText).toHaveBeenCalledWith("opex", { number: jid, text: "segredo da conversa", quotedId: "Q" })
        await post({ type: "reaction", messageId: "M", fromMe: false, emoji: "👍" })
        expect(mocks.evolution.sendReaction).toHaveBeenCalledWith("opex", { remoteJid: jid, id: "M", fromMe: false, reaction: "👍" })
        await post({ type: "location", latitude: -19.9, longitude: -43.9, name: "Escritório" })
        expect(mocks.evolution.sendLocation).toHaveBeenCalledWith("opex", expect.objectContaining({ number: jid, latitude: -19.9, longitude: -43.9, name: "Escritório" }))
        await post({ type: "contact", contacts: [{ name: "Ana", number: "+55 31 98888-7777" }] })
        expect(mocks.evolution.sendContact).toHaveBeenCalledWith("opex", { number: jid, contacts: [{ name: "Ana", number: "5531988887777" }], quotedId: undefined })
        expect(mocks.audit).toHaveBeenCalledTimes(4)
        expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("segredo da conversa")
    })

    it("D2: o envio pela tela não grava secretary_sent (volta pelo webhook e pausa como o celular)", async () => {
        await post({ type: "text", text: "oi" })
        expect(mocks.sentUpsert).not.toHaveBeenCalled()
    })

    it("multipart: foto com legenda, voz e arquivo recusado com mensagem pt-BR", async () => {
        const form = (file: File, fields: Record<string, string> = {}) => {
            const body = new FormData()
            body.append("file", file)
            for (const [key, value] of Object.entries(fields)) body.append(key, value)
            return POST(new NextRequest(`http://localhost/api/secretary/conversations/${chatId}/messages`, { method: "POST", body }), params)
        }
        expect((await form(new File([new Uint8Array([1, 2])], "foto.png", { type: "image/png" }), { caption: "olha" })).status).toBe(200)
        expect(mocks.evolution.sendMedia).toHaveBeenCalledWith("opex", expect.objectContaining({ number: jid, mediatype: "image", mimetype: "image/png", fileName: "foto.png", caption: "olha", base64: "AQI=" }))
        await form(new File([new Uint8Array([3])], "voz.webm", { type: "audio/webm" }), { voice: "1" })
        expect(mocks.evolution.sendWhatsAppAudio).toHaveBeenCalledWith("opex", expect.objectContaining({ number: jid, base64: "Aw==" }))
        const refused = await form(new File([new Uint8Array([1])], "f.heic", { type: "image/heic" }))
        expect(refused.status).toBe(400)
        expect((await refused.json()).error).toBe("“f.heic”: o WhatsApp só aceita fotos JPG ou PNG.")
    })

    it("corpo inválido devolve 400", async () => {
        expect((await post({ type: "text", text: "" })).status).toBe(400)
    })
})

it("GET mídia devolve o binário com o tipo", async () => {
    mocks.evolution.mediaBase64.mockResolvedValue({ base64: Buffer.from("png").toString("base64"), mimetype: "image/png", fileName: "a.png" })
    const response = await MEDIA(new NextRequest(`http://localhost/api/secretary/conversations/${chatId}/messages/M/media`), { params: Promise.resolve({ chatId, messageId: "M" }) })
    expect(response.headers.get("content-type")).toBe("image/png")
    expect(response.headers.get("content-disposition")).toBe("inline; filename*=UTF-8''a.png")
    expect(response.headers.get("x-content-type-options")).toBe("nosniff")
    expect(response.headers.get("content-security-policy")).toBe("sandbox; default-src 'none'")
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("png")
})

it.each(["text/html", "image/svg+xml", "application/pdf"])("GET mídia com tipo %s do remetente vira download, nunca inline", async (mimetype) => {
    mocks.evolution.mediaBase64.mockResolvedValue({ base64: Buffer.from("<script>alert(1)</script>").toString("base64"), mimetype, fileName: "x" })
    const response = await MEDIA(new NextRequest(`http://localhost/api/secretary/conversations/${chatId}/messages/M/media`), { params: Promise.resolve({ chatId, messageId: "M" }) })
    expect(response.headers.get("content-type")).toBe("application/octet-stream")
    expect(response.headers.get("content-disposition")).toBe("attachment; filename*=UTF-8''x")
    expect(response.headers.get("x-content-type-options")).toBe("nosniff")
    expect(response.headers.get("content-security-policy")).toBe("sandbox; default-src 'none'")
})
