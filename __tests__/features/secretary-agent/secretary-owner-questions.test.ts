import { beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_SECRETARY_SETTINGS } from "@/features/secretary-agent/schemas"
import type { ParsedMessage } from "@/features/evolution-api/message"

const OWNER = "5531988887777@s.whatsapp.net"

const mocks = vi.hoisted(() => ({
    notices: [] as Record<string, unknown>[],
    conversation: null as Record<string, unknown> | null,
    sendText: vi.fn(async () => ({ key: { id: "OUT" } })),
    createMemory: vi.fn(),
    turn: vi.fn(),
    reserve: vi.fn(async () => ({ modifiedCount: 1 })),
    noticeUpdate: vi.fn(async () => ({ modifiedCount: 1 })),
}))

vi.mock("@/lib/pusher/channels", () => ({ publishAppEvent: vi.fn() }))
vi.mock("@/features/ai/server/agent-memory-service", () => ({ createAgentMemory: mocks.createMemory }))
vi.mock("@/features/evolution-api/server/client", () => ({ evolution: { sendText: mocks.sendText } }))
vi.mock("@/features/evolution-api/server/models", () => ({ EvolutionInstanceState: { findById: () => ({ lean: async () => ({ ownerJid: OWNER }) }) } }))
vi.mock("@/features/secretary-agent/server/settings", () => ({
    loadSecretarySettings: async () => ({ settings: { ...DEFAULT_SECRETARY_SETTINGS, enabled: true, mode: "reply", main: { ...DEFAULT_SECRETARY_SETTINGS.main, provider: "opencode-go", model: "m" } } }),
}))
vi.mock("@/features/secretary-agent/server/ai", () => ({ secretaryInference: async () => ({ global: false, memory: "Ana é a vizinha" }) }))
vi.mock("@/features/secretary-agent/server/turn", () => ({ runSecretaryTurn: mocks.turn }))
vi.mock("@/features/secretary-agent/server/models", () => {
    const find = (filter: Record<string, unknown>) => mocks.notices.filter((notice) => Object.entries(filter).every(([key, value]) => notice[key] === value))
    return {
        secretaryDb: vi.fn(),
        SecretarySent: { updateOne: vi.fn() },
        SecretaryConversation: { findById: () => ({ lean: async () => mocks.conversation }), updateOne: mocks.reserve },
        SecretaryNotice: {
            countDocuments: async () => find({ status: "pending" }).length,
            find: (filter: Record<string, unknown>) => ({ select: () => ({ lean: async () => find(filter) }) }),
            findOneAndUpdate: (filter: Record<string, unknown>, update: { $set: Record<string, unknown> }) => ({
                lean: async () => {
                    const notice = find(filter)[0]
                    if (!notice) return null
                    Object.assign(notice, update.$set)
                    return notice
                },
            }),
            updateOne: async (filter: Record<string, unknown>, update: { $set: Record<string, unknown> }) => {
                const notice = find(filter)[0]
                if (notice) Object.assign(notice, update.$set)
                return { modifiedCount: notice ? 1 : 0 }
            },
            create: vi.fn(),
        },
    }
})

import { answerNotice, discardNotice, handleOwnerReply } from "@/features/secretary-agent/server/owner-questions"

const trigger = { id: "T", chatJid: "5531999999999@s.whatsapp.net", text: "você vai?" } as ParsedMessage
function question(id: string, sentMessageId: string, ownerRevision: Date | null = null) {
    return { _id: id, instance: "opex", chatId: "5531999999999", kind: "question", status: "pending", text: "Vai na festa?", sentMessageId, trigger, ownerRevision }
}
const reply = (patch: Partial<ParsedMessage>) => ({ id: "R", chatJid: OWNER, fromMe: true, text: "sim", quotedId: null, ...patch }) as ParsedMessage

beforeEach(() => {
    vi.clearAllMocks()
    mocks.notices = []
    mocks.conversation = { lastOwnerMessageAt: null }
})

describe("perguntar ao dono", () => {
    it("resposta citada resolve a pergunta citada, grava a memória e retoma a conversa", async () => {
        mocks.notices = [question("q1", "m1"), question("q2", "m2")]
        await handleOwnerReply("opex", OWNER, reply({ quotedId: "m2" }))
        expect(mocks.notices[1]).toMatchObject({ status: "answered", answer: "sim", memoryChannel: "agentes/secretario/conversas/5531999999999" })
        expect(mocks.notices[0]).toMatchObject({ status: "pending" })
        expect(mocks.createMemory).toHaveBeenCalledWith("secretary-conversation", "Ana é a vizinha", expect.any(String), expect.objectContaining({ conversationId: "5531999999999" }))
        expect(mocks.turn).toHaveBeenCalledWith(expect.objectContaining({ ownerAnswer: "sim" }))
    })

    it("sem citação e uma pendente, vale para ela", async () => {
        mocks.notices = [question("q1", "m1")]
        await handleOwnerReply("opex", OWNER, reply({}))
        expect(mocks.notices[0]).toMatchObject({ status: "answered" })
    })

    it("sem citação e várias pendentes, pede que o dono cite", async () => {
        mocks.notices = [question("q1", "m1"), question("q2", "m2")]
        await handleOwnerReply("opex", OWNER, reply({}))
        expect(mocks.notices.every((notice) => notice.status === "pending")).toBe(true)
        expect(mocks.sendText).toHaveBeenCalledWith("opex", expect.objectContaining({ number: OWNER, text: expect.stringContaining("citando") }))
    })

    it("não retoma quando o dono já assumiu a conversa, mas grava a memória", async () => {
        mocks.notices = [question("q1", "m1", new Date("2026-11-25T10:00:00Z"))]
        mocks.conversation = { lastOwnerMessageAt: new Date("2026-11-25T11:00:00Z") }
        await answerNotice("q1", "sim")
        expect(mocks.createMemory).toHaveBeenCalledTimes(1)
        expect(mocks.turn).not.toHaveBeenCalled()
    })

    it("descartar tira a pergunta das pendentes", async () => {
        mocks.notices = [question("q1", "m1")]
        await discardNotice("q1")
        expect(mocks.notices[0]).toMatchObject({ status: "discarded" })
        await expect(discardNotice("q1")).rejects.toThrow("não está mais pendente")
    })
})
