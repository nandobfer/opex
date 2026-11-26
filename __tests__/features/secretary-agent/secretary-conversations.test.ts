import { beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_SECRETARY_SETTINGS } from "@/features/secretary-agent/schemas"

const mocks = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), contacts: vi.fn(), states: vi.fn(), notices: vi.fn(), update: vi.fn(), audit: vi.fn(), publish: vi.fn() }))
vi.mock("@/lib/db", () => ({ AcaoAuditoria: { ATUALIZAR: "ATUALIZAR" }, recordAudit: mocks.audit }))
vi.mock("@/lib/pusher/channels", () => ({ publishAppEvent: mocks.publish }))
vi.mock("@/features/evolution-api/server/contacts", () => ({ listContacts: mocks.contacts }))
vi.mock("@/features/secretary-agent/server/settings", () => ({ loadSecretarySettings: mocks.load, saveSecretarySettings: mocks.save }))
vi.mock("@/features/secretary-agent/server/models", () => ({
    secretaryDb: vi.fn(),
    SecretaryConversation: { updateOne: mocks.update, find: () => ({ select: () => ({ lean: mocks.states }) }) },
    SecretaryNotice: { distinct: mocks.notices },
}))

import { changeConversation, listSecretaryConversations } from "@/features/secretary-agent/server/conversations"

const chatId = "5531999999999"
const jid = `${chatId}@s.whatsapp.net`
const settings = { ...DEFAULT_SECRETARY_SETTINGS, instance: "opex" }
const blockedSettings = { ...settings, criteria: { ...settings.criteria, audience: { ...settings.criteria.audience, blocked: [jid] } } }

beforeEach(() => {
    vi.clearAllMocks()
    mocks.load.mockResolvedValue({ settings })
})

describe("conversas do Secretário", () => {
    it("pausa e retoma na instância configurada, com auditoria e evento", async () => {
        vi.useFakeTimers({ toFake: ["Date"] })
        const now = new Date("2026-11-25T12:00:00Z")
        vi.setSystemTime(now)
        try {
            await changeConversation(chatId, { action: "pause", minutes: 20 }, "local")
            await changeConversation(chatId, { action: "resume" }, "local")
        } finally {
            vi.useRealTimers()
        }
        expect(mocks.update.mock.calls).toEqual([new Date(now.getTime() + 20 * 60_000), null].map((pausedUntil) => [
            { _id: `opex:${chatId}` }, { $set: { pausedUntil }, $setOnInsert: { instance: "opex", jid } }, { upsert: true },
        ]))
        expect(mocks.audit).toHaveBeenCalledTimes(2)
        expect(mocks.publish).toHaveBeenCalledWith("secretary-conversation-updated", { chatId })
    })

    it("exclui e retira a exclusão sem mudar os escolhidos", async () => {
        await changeConversation(chatId, { action: "exclude" }, "local")
        mocks.load.mockResolvedValueOnce({ settings: blockedSettings })
        await changeConversation(chatId, { action: "include" }, "local")
        expect(mocks.save).toHaveBeenNthCalledWith(1, blockedSettings, "local")
        expect(mocks.save).toHaveBeenNthCalledWith(2, settings, "local")
    })

    it("OPE-197: a lista leva a prévia e as não lidas do WhatsApp na ordem do cache (última mensagem primeiro)", async () => {
        const lastMessage = { text: "oi", kind: "text", fromMe: false }
        mocks.contacts.mockResolvedValueOnce([{ jid: "5521999999999@s.whatsapp.net", lastMessageAt: "2026-11-26T10:00:00.000Z", lastMessage, unreadCount: 3 }, { jid, lastMessageAt: "2026-11-25T10:00:00.000Z", lastMessage: null, unreadCount: 0 }])
        mocks.states.mockResolvedValueOnce([])
        mocks.notices.mockResolvedValueOnce([])
        const rows = await listSecretaryConversations()
        expect(rows.map((row) => [row.chatId, row.unreadCount, row.lastMessage])).toEqual([["5521999999999", 3, lastMessage], [chatId, 0, null]])
    })

    it("lista estados de exclusão, pausa, pergunta ao dono e conversa ativa", async () => {
        const other = ["5511999999999", "5521999999999", "5541999999999"]
        const jids = [jid, ...other.map((id) => `${id}@s.whatsapp.net`)]
        mocks.load.mockResolvedValueOnce({ settings: blockedSettings })
        mocks.contacts.mockResolvedValueOnce(jids.map((jid) => ({ jid })))
        const pausedUntil = new Date(Date.now() + 60_000)
        mocks.states.mockResolvedValueOnce(jids.slice(0, 2).map((jid) => ({ jid, pausedUntil })))
        mocks.notices.mockResolvedValueOnce(other.slice(0, 2))
        const rows = await listSecretaryConversations()
        expect(mocks.contacts).toHaveBeenCalledWith("chats", "opex")
        expect(rows.map((row) => [row.chatId, row.state])).toEqual([
            [chatId, "excluded"], [other[0], "paused"], [other[1], "waiting-owner"], [other[2], "active"],
        ])
    })
})
