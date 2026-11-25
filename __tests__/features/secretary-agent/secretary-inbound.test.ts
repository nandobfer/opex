import { beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_SECRETARY_SETTINGS } from "@/features/secretary-agent/schemas"
import type { ParsedMessage } from "@/features/evolution-api/message"

const OWNER = "5531988887777@s.whatsapp.net"
const CONTACT = "5531999999999@s.whatsapp.net"

const mocks = vi.hoisted(() => ({
    settings: {} as Record<string, unknown>,
    sentIds: new Set<string>(),
    conversationUpdate: vi.fn(),
    decision: vi.fn(),
    turn: vi.fn(),
    ownerReply: vi.fn(),
}))

vi.mock("node:timers/promises", () => ({ setTimeout: vi.fn(async () => undefined) }))
vi.mock("@/lib/pusher/channels", () => ({ publishAppEvent: vi.fn() }))
vi.mock("@/features/evolution-api/server/models", () => ({ EvolutionInstanceState: { findById: () => ({ select: () => ({ lean: async () => ({ ownerJid: OWNER }) }) }) } }))
vi.mock("@/features/secretary-agent/server/settings", () => ({ loadSecretarySettings: async () => ({ settings: mocks.settings }) }))
vi.mock("@/features/secretary-agent/server/turn", () => ({ runSecretaryTurn: mocks.turn }))
vi.mock("@/features/secretary-agent/server/owner-questions", () => ({ handleOwnerReply: mocks.ownerReply }))
vi.mock("@/features/secretary-agent/server/models", () => ({
    secretaryDb: vi.fn(),
    SecretarySent: { exists: vi.fn(async ({ _id }: { _id: string }) => (mocks.sentIds.has(_id) ? { _id } : null)) },
    SecretaryConversation: { updateOne: mocks.conversationUpdate },
    SecretaryDecisionRecord: { updateOne: mocks.decision },
}))

import { handleIncomingMessage } from "@/features/secretary-agent/server/inbound"

function msg(patch: Partial<ParsedMessage>): ParsedMessage {
    return { id: "M1", chatJid: CONTACT, fromMe: false, isGroup: false, participant: null, pushName: "Ana", text: "oi", media: null, quotedId: null, quotedAuthor: null, mentioned: [], timestamp: new Date(), ignorable: false, ...patch }
}

beforeEach(() => {
    vi.clearAllMocks()
    mocks.sentIds.clear()
    mocks.settings = { ...DEFAULT_SECRETARY_SETTINGS, enabled: true, instance: "opex", main: { ...DEFAULT_SECRETARY_SETTINGS.main, provider: "opencode-go", model: "m" } }
})

const decisions = () => mocks.decision.mock.calls.map((call) => (call[1] as { $set: { decision: string } }).$set.decision)

describe("handleIncomingMessage", () => {
    it("mensagem do dono pelo celular pausa a conversa", async () => {
        await handleIncomingMessage("opex", msg({ fromMe: true }))
        expect(mocks.conversationUpdate).toHaveBeenCalledWith({ _id: "opex:5531999999999" }, expect.objectContaining({ $max: expect.objectContaining({ pausedUntil: expect.any(Date) }) }), { upsert: true })
        expect(decisions()).toEqual(["paused"])
        expect(mocks.turn).not.toHaveBeenCalled()
    })

    it("mensagem enviada pelo próprio agente não pausa", async () => {
        mocks.sentIds.add("opex:M1")
        await handleIncomingMessage("opex", msg({ fromMe: true }))
        expect(mocks.conversationUpdate).not.toHaveBeenCalled()
        expect(decisions()).toEqual([])
    })

    it("ignora mensagem de ontem sem iniciar turno nem alterar a conversa", async () => {
        const timestamp = new Date(Date.now() - 24 * 60 * 60_000)
        await handleIncomingMessage("opex", msg({ timestamp }))
        await handleIncomingMessage("opex", msg({ timestamp, fromMe: true, id: "M2" }))
        await handleIncomingMessage("opex", msg({ timestamp, fromMe: true, id: "M3", chatJid: OWNER }))
        expect(decisions()).toEqual(["ignored", "ignored", "ignored"])
        expect(mocks.turn).not.toHaveBeenCalled()
        expect(mocks.ownerReply).not.toHaveBeenCalled()
        expect(mocks.conversationUpdate).not.toHaveBeenCalled()
    })

    it("conta a pausa restante a partir do envio pelo dono", async () => {
        const timestamp = new Date(Date.now() - 15 * 60_000)
        await handleIncomingMessage("opex", msg({ timestamp, fromMe: true }))
        expect(decisions()).toEqual(["paused"])
        expect(mocks.conversationUpdate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
            $max: { lastOwnerMessageAt: timestamp, pausedUntil: new Date(timestamp.getTime() + 30 * 60_000) },
        }), { upsert: true })
    })

    it("conversa consigo mesmo nunca vira turno e só é lida como resposta do dono", async () => {
        await handleIncomingMessage("opex", msg({ chatJid: OWNER, fromMe: true }))
        expect(mocks.ownerReply).toHaveBeenCalledTimes(1)
        expect(mocks.conversationUpdate).not.toHaveBeenCalled()
        await handleIncomingMessage("opex", msg({ chatJid: OWNER, fromMe: false }))
        expect(mocks.turn).not.toHaveBeenCalled()
    })

    it("agente desligado registra o motivo e não responde", async () => {
        mocks.settings = { ...mocks.settings, enabled: false }
        await handleIncomingMessage("opex", msg({}))
        expect(decisions()).toEqual(["disabled"])
        expect(mocks.turn).not.toHaveBeenCalled()
    })

    it("cada mensagem grava um token novo e o turno roda depois da janela", async () => {
        await handleIncomingMessage("opex", msg({ id: "A" }))
        await handleIncomingMessage("opex", msg({ id: "B" }))
        const tokens = mocks.conversationUpdate.mock.calls.map((call) => (call[1] as { $set: { token: string } }).$set.token)
        expect(new Set(tokens).size).toBe(2)
        expect(mocks.turn).toHaveBeenCalledTimes(2)
        expect(mocks.turn.mock.calls[1]![0]).toMatchObject({ token: tokens[1], chatId: "5531999999999" })
    })
})
