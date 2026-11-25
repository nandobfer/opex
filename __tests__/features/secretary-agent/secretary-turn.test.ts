import { beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_SECRETARY_SETTINGS } from "@/features/secretary-agent/schemas"
import type { ParsedMessage } from "@/features/evolution-api/message"

const CONTACT = "5531999999999@s.whatsapp.net"

const mocks = vi.hoisted(() => ({
    settings: {} as Record<string, unknown>,
    state: null as Record<string, unknown> | null,
    current: true,
    currentAfter: Infinity,
    currentCalls: 0,
    replies: 0,
    spent: 0,
    subject: null as unknown,
    inference: vi.fn(),
    decide: vi.fn(),
    send: vi.fn(async () => "S1"),
    askOwner: vi.fn(),
    markAsRead: vi.fn(),
    presence: vi.fn(),
    noticeUpsert: vi.fn(async () => ({ upsertedCount: 1 })),
}))

vi.mock("node:timers/promises", () => ({ setTimeout: vi.fn(async () => undefined) }))
vi.mock("ai", () => ({ dynamicTool: (tool: unknown) => tool }))
vi.mock("@/lib/db/models/AiConsumption", () => ({ AiConsumption: { aggregate: async () => [{ total: mocks.spent }] } }))
vi.mock("@/features/ai/server/agent-memory-context", () => ({ agentMemoryContext: async () => ({ block: "" }) }))
vi.mock("@/features/ai/server/self-memory/settings", () => ({ selfMemoryEnabled: async () => true }))
vi.mock("@/features/ai/server/self-memory/tools", () => ({ selfMemoryTools: () => [] }))
vi.mock("@/features/evolution-api/server/client", () => ({
    evolution: { findMessages: async () => ({ records: [] }), markAsRead: mocks.markAsRead, sendPresence: mocks.presence },
}))
vi.mock("@/features/secretary-agent/server/inbound", () => ({ recordDecision: mocks.decide }))
vi.mock("@/features/secretary-agent/server/settings", () => ({ loadSecretarySettings: async () => ({ settings: mocks.settings }) }))
vi.mock("@/features/secretary-agent/server/classify", () => ({ classify: async () => mocks.subject }))
vi.mock("@/features/secretary-agent/server/ai", () => ({ secretaryInference: mocks.inference }))
vi.mock("@/features/secretary-agent/server/media", () => ({ readTurnMedia: async (_s: unknown, _i: string, message: ParsedMessage) => ({ text: message.text || "[áudio]", understood: false }) }))
vi.mock("@/features/secretary-agent/server/personality", () => ({ loadPersonality: async () => ({ snapshot: { base: { blocks: [] }, variants: [] } }) }))
vi.mock("@/features/secretary-agent/server/owner-questions", () => ({ askOwner: mocks.askOwner, publishNotices: vi.fn(), sendSecretaryText: mocks.send }))
vi.mock("@/features/secretary-agent/server/models", () => ({
    SecretaryConversation: {
        findOneAndUpdate: () => ({ lean: async () => mocks.state }),
        exists: async () => (++mocks.currentCalls > mocks.currentAfter ? null : mocks.current ? { _id: "x" } : null),
        updateOne: vi.fn(),
    },
    SecretaryDecisionRecord: { countDocuments: async () => mocks.replies },
    SecretaryNotice: { updateOne: mocks.noticeUpsert },
}))

import { runSecretaryTurn } from "@/features/secretary-agent/server/turn"

function msg(patch: Partial<ParsedMessage> = {}): ParsedMessage {
    return { id: "M1", chatJid: CONTACT, fromMe: false, isGroup: false, participant: null, pushName: "Ana", text: "oi, tudo bem?", media: null, quotedId: null, quotedAuthor: null, mentioned: [], timestamp: new Date(), ignorable: false, ...patch }
}
const turn = (message = msg()) => runSecretaryTurn({ id: "opex:5531999999999", instance: "opex", chatId: "5531999999999", ownerJid: "5531988887777@s.whatsapp.net", token: "T", message })
const decisions = () => mocks.decide.mock.calls.map((call) => call[3])

beforeEach(() => {
    vi.clearAllMocks()
    Object.assign(mocks, { state: { pending: [msg()], lastOwnerMessageAt: null, pausedUntil: null }, current: true, currentAfter: Infinity, currentCalls: 0, replies: 0, spent: 0, subject: null })
    mocks.settings = {
        ...DEFAULT_SECRETARY_SETTINGS,
        enabled: true,
        instance: "opex",
        main: { ...DEFAULT_SECRETARY_SETTINGS.main, provider: "opencode-go", model: "m" },
        criteria: { ...DEFAULT_SECRETARY_SETTINGS.criteria, baseScope: "all" },
    }
    mocks.inference.mockResolvedValue({ text: "oi!\n\ntudo sim", question: null })
})

describe("runSecretaryTurn", () => {
    it("só a última mensagem da janela responde (token trocado vira agrupada)", async () => {
        mocks.state = null
        await turn()
        expect(decisions()).toEqual(["grouped"])
        expect(mocks.inference).not.toHaveBeenCalled()
    })

    it("responde em partes curtas e marca como lida só ao enviar", async () => {
        await turn()
        expect(mocks.send).toHaveBeenCalledTimes(2)
        expect(mocks.markAsRead).toHaveBeenCalledTimes(1)
        expect(decisions()).toEqual(["replied"])
    })

    it("descarta a resposta quando o dono assume no meio do turno", async () => {
        mocks.currentAfter = 1
        await turn()
        expect(mocks.send).not.toHaveBeenCalled()
        expect(mocks.markAsRead).not.toHaveBeenCalled()
        expect(decisions()).toEqual(["discarded"])
    })

    it.each([
        ["excluída", () => (mocks.settings = { ...mocks.settings, criteria: { ...(mocks.settings.criteria as object), exclude: [CONTACT] } }), "ignored"],
        ["pausada", () => (mocks.state = { ...mocks.state, pausedUntil: new Date(Date.now() + 60_000) }), "paused"],
        ["assunto nunca", () => (mocks.subject = { never: true, always: false, topic: "dinheiro", reason: null }), "subject-blocked"],
        ["só observar", () => (mocks.settings = { ...mocks.settings, mode: "observe" }), "observe-only"],
        ["limite atingido", () => (mocks.replies = 20), "limit-reached"],
        ["escopo nenhuma", () => (mocks.settings = { ...mocks.settings, criteria: { ...(mocks.settings.criteria as object), baseScope: "none" } }), "ignored"],
    ])("conversa %s não é respondida nem marcada como lida", async (_label, setup, decision) => {
        setup()
        await turn()
        expect(decisions()).toEqual([decision])
        expect(mocks.markAsRead).not.toHaveBeenCalled()
        expect(mocks.send.mock.calls.filter((call) => (call as unknown[])[1] === CONTACT)).toHaveLength(0)
    })

    it("assunto nunca não avisa o dono", async () => {
        mocks.subject = { never: true, always: false, topic: null, reason: null }
        await turn()
        expect(mocks.send).not.toHaveBeenCalled()
        expect(mocks.askOwner).not.toHaveBeenCalled()
    })

    it("limite atingido avisa o dono uma vez por janela", async () => {
        mocks.replies = 20
        await turn()
        mocks.noticeUpsert.mockResolvedValueOnce({ upsertedCount: 0 })
        await turn()
        expect(mocks.send).toHaveBeenCalledTimes(1)
        expect((mocks.noticeUpsert.mock.calls[0] as unknown[])[0]).toMatchObject({ _id: expect.stringMatching(/^limit:5531999999999:/) })
    })

    it("mensagem só de mídia com a leitura desligada não responde pelo marcador", async () => {
        mocks.state = { pending: [msg({ text: "", media: { kind: "audio", mimetype: "audio/ogg", fileName: null } })], lastOwnerMessageAt: null, pausedUntil: null }
        await turn(msg({ text: "", media: { kind: "audio", mimetype: "audio/ogg", fileName: null } }))
        expect(decisions()).toEqual(["ignored"])
        expect(mocks.inference).not.toHaveBeenCalled()
    })

    it("erro da Evolution registra a decisão de erro sem reenviar", async () => {
        mocks.send.mockRejectedValueOnce(new Error("fora do ar"))
        await turn()
        expect(decisions()).toEqual(["error"])
        expect(mocks.send).toHaveBeenCalledTimes(1)
    })

    it("pergunta ao dono quando o modelo não sabe", async () => {
        mocks.inference.mockResolvedValue({ text: "vou ver e te falo", question: "Ana pergunta se você vai na festa?" })
        await turn()
        expect(mocks.askOwner).toHaveBeenCalledWith(expect.objectContaining({ question: "Ana pergunta se você vai na festa?" }))
        expect(decisions()).toEqual(["asked-owner"])
    })
})
