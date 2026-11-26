import { beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_SECRETARY_SETTINGS } from "@/features/secretary-agent/schemas"
import type { ParsedMessage } from "@/features/evolution-api/message"

const OWNER = "5531988887777@s.whatsapp.net"

const mocks = vi.hoisted(() => ({
    notices: [] as Record<string, unknown>[],
    conversation: null as Record<string, unknown> | null,
    jobs: [] as (() => Promise<void>)[],
    sendText: vi.fn(async () => ({ key: { id: "OUT" } })),
    createMemory: vi.fn(),
    inference: vi.fn(),
    audit: vi.fn(),
    turn: vi.fn(),
    reserve: vi.fn(async () => ({ modifiedCount: 1 })),
    create: vi.fn(),
}))

vi.mock("@/lib/pusher/channels", () => ({ publishAppEvent: vi.fn() }))
vi.mock("@/lib/db", () => ({ AcaoAuditoria: { ATUALIZAR: "ATUALIZAR" }, recordAudit: mocks.audit }))
vi.mock("@/lib/after-response", () => ({ runAfterResponse: (_label: string, job: () => Promise<void>) => mocks.jobs.push(job) }))
vi.mock("@/features/ai/server/agent-memory-service", () => ({ createAgentMemory: mocks.createMemory }))
vi.mock("@/features/evolution-api/server/client", () => ({ evolution: { sendText: mocks.sendText } }))
vi.mock("@/features/evolution-api/server/contacts", () => ({ contactsByJid: async (jids: string[]) => new Map([[jids[0], { name: "Grupo da família" }]]) }))
vi.mock("@/features/evolution-api/server/models", () => ({ EvolutionInstanceState: { findById: () => ({ lean: async () => ({ ownerJid: OWNER, ownerLid: "999@lid" }) }) } }))
vi.mock("@/features/secretary-agent/server/settings", () => ({
    loadSecretarySettings: async () => ({ settings: { ...DEFAULT_SECRETARY_SETTINGS, enabled: true, mode: "reply", main: { ...DEFAULT_SECRETARY_SETTINGS.main, provider: "opencode-go", model: "m" } } }),
}))
vi.mock("@/features/secretary-agent/server/ai", () => ({ secretaryInference: mocks.inference }))
vi.mock("@/features/secretary-agent/server/turn", () => ({ runSecretaryTurn: mocks.turn }))
vi.mock("@/features/secretary-agent/server/models", () => {
    const matches = (notice: Record<string, unknown>, filter: Record<string, unknown>): boolean =>
        Object.entries(filter).every(([key, value]) => {
            if (key === "$or") return (value as Record<string, unknown>[]).some((branch) => matches(notice, branch))
            if (value && typeof value === "object" && !(value instanceof Date)) return notice[key] !== undefined && notice[key] !== null && (notice[key] as Date) < (value as { $lt: Date }).$lt
            return notice[key] === value
        })
    const find = (filter: Record<string, unknown>) => mocks.notices.filter((notice) => matches(notice, filter))
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
                    return { ...notice }
                },
            }),
            updateOne: async (filter: Record<string, unknown>, update: { $set: Record<string, unknown> }) => {
                const notice = find(filter)[0]
                if (notice) Object.assign(notice, update.$set)
                return { modifiedCount: notice ? 1 : 0 }
            },
            create: mocks.create,
        },
    }
})

import { answerNotice, askOwner, discardNotice, handleOwnerReply } from "@/features/secretary-agent/server/owner-questions"

const trigger = { id: "T", chatJid: "5531999999999@s.whatsapp.net", text: "você vai?" } as ParsedMessage
function question(id: string, sentMessageId: string, ownerRevision: Date | null = null) {
    return { _id: id, instance: "opex", chatId: "5531999999999", kind: "question", status: "pending", text: "Vai na festa?", sentMessageId, trigger, ownerRevision, answeringAt: null }
}
const reply = (patch: Partial<ParsedMessage>) => ({ id: "R", chatJid: OWNER, fromMe: true, text: "sim", quotedId: null, ...patch }) as ParsedMessage
const runJobs = async () => {
    for (const job of mocks.jobs.splice(0)) await job()
}

beforeEach(() => {
    vi.clearAllMocks()
    mocks.notices = []
    mocks.jobs = []
    mocks.conversation = { lastOwnerMessageAt: null }
    mocks.inference.mockResolvedValue({ global: false, memory: "Ana é a vizinha" })
})

describe("perguntar ao dono", () => {
    it("envia e guarda o trecho agrupado com transcrição, grupo e autor", async () => {
        const message = { ...trigger, chatJid: "123@g.us", isGroup: true, participant: "999@lid", pushName: "João", text: "" }
        const text = "Oi, estamos combinando a festa.\n[áudio]\nVocê vai no sábado?"
        await askOwner({ instance: "opex", ownerJid: OWNER, chatId: "g-123", message, text, question: "Você vai?", ownerRevision: null })
        expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ contactName: "Grupo da família", author: "João", excerpt: text }))
        expect(mocks.sendText).toHaveBeenCalledWith("opex", { number: OWNER, text: `❓ Grupo da família (João): Você vai?\n\n${text}` })
    })
    it("resposta citada resolve a pergunta citada, grava a memória, audita e retoma a conversa depois", async () => {
        mocks.notices = [question("q1", "m1"), question("q2", "m2")]
        await handleOwnerReply("opex", OWNER, reply({ quotedId: "m2" }))
        expect(mocks.notices[1]).toMatchObject({ status: "answered", answer: "sim", memoryChannel: "agentes/secretario/conversas/5531999999999" })
        expect(mocks.notices[0]).toMatchObject({ status: "pending" })
        expect(mocks.createMemory).toHaveBeenCalledWith("secretary-conversation", "Ana é a vizinha", "local", expect.objectContaining({ conversationId: "5531999999999" }))
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ entidade: "AgenteSecretario", entidadeId: "q2" }))
        expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("sim")
        // A retomada roda fora da requisição.
        expect(mocks.turn).not.toHaveBeenCalled()
        await runJobs()
        expect(mocks.turn).toHaveBeenCalledWith(expect.objectContaining({ ownerAnswer: "sim" }))
    })

    it("sem citação e uma pendente, vale para ela", async () => {
        mocks.notices = [question("q1", "m1")]
        await handleOwnerReply("opex", OWNER, reply({}))
        expect(mocks.notices[0]).toMatchObject({ status: "answered" })
    })

    it("retoma pergunta de grupo com a menção e o LID do dono", async () => {
        const groupTrigger = { ...trigger, chatJid: "120363000000000001@g.us", isGroup: true, mentioned: ["999@lid"] }
        mocks.notices = [{ ...question("q1", "m1"), chatId: "g-120363000000000001", trigger: groupTrigger }]
        await answerNotice("q1", "sim", "local")
        await runJobs()
        expect(mocks.turn).toHaveBeenCalledWith(expect.objectContaining({ ownerJid: OWNER, ownerLid: "999@lid", message: groupTrigger, ownerAnswer: "sim" }))
    })

    it("sem citação e várias pendentes, pede que o dono cite", async () => {
        mocks.notices = [question("q1", "m1"), question("q2", "m2")]
        await handleOwnerReply("opex", OWNER, reply({}))
        expect(mocks.notices.every((notice) => notice.status === "pending")).toBe(true)
        expect(mocks.sendText).toHaveBeenCalledWith("opex", expect.objectContaining({ number: OWNER, text: expect.stringContaining("citando") }))
    })

    it("falha ao aprender devolve a pergunta para pendente e permite responder de novo", async () => {
        mocks.notices = [question("q1", "m1")]
        mocks.inference.mockRejectedValueOnce(new Error("provedor fora do ar"))
        await expect(answerNotice("q1", "sim", "local")).rejects.toThrow("continua pendente")
        expect(mocks.notices[0]).toMatchObject({ status: "pending" })
        expect(mocks.createMemory).not.toHaveBeenCalled()
        await answerNotice("q1", "sim", "local")
        expect(mocks.notices[0]).toMatchObject({ status: "answered" })
        expect(mocks.createMemory).toHaveBeenCalledTimes(1)
    })

    it("falha ao gravar a memória também devolve a pergunta para pendente", async () => {
        mocks.notices = [question("q1", "m1")]
        mocks.createMemory.mockRejectedValueOnce(Object.assign(new Error("recusada"), { code: "ENGRAMIND_VALIDATION_ERROR" }))
        await expect(answerNotice("q1", "sim", "local")).rejects.toThrow()
        expect(mocks.notices[0]).toMatchObject({ status: "pending" })
    })

    it("resposta em andamento não é respondida duas vezes", async () => {
        mocks.notices = [{ ...question("q1", "m1"), status: "answering", answeringAt: new Date() }]
        await expect(answerNotice("q1", "sim", "local")).rejects.toThrow("não está mais pendente")
    })

    it("resposta presa em andamento há mais de 5 min (processo reiniciado) pode ser respondida de novo", async () => {
        mocks.notices = [{ ...question("q1", "m1"), status: "answering", answeringAt: new Date(Date.now() - 6 * 60_000) }]
        await answerNotice("q1", "sim", "local")
        expect(mocks.notices[0]).toMatchObject({ status: "answered", answer: "sim" })
    })

    it("resposta presa também pode ser descartada", async () => {
        mocks.notices = [{ ...question("q1", "m1"), status: "answering", answeringAt: new Date(Date.now() - 6 * 60_000) }]
        await discardNotice("q1", "local")
        expect(mocks.notices[0]).toMatchObject({ status: "discarded" })
    })

    it("o log da falha não leva o corpo da requisição da SDK (conversa) nem a resposta", async () => {
        const { secretaryLog } = await import("@/features/secretary-agent/server/log")
        const spy = vi.spyOn(secretaryLog, "error").mockImplementation(() => undefined)
        mocks.notices = [question("q1", "m1")]
        mocks.inference.mockRejectedValueOnce(Object.assign(new Error("Internal Server Error: a conversa secreta"), { name: "AI_APICallError", statusCode: 500, requestBodyValues: { messages: "a conversa secreta" }, responseBody: "corpo", responseHeaders: { "x-key": "k" } }))
        await expect(answerNotice("q1", "sim", "local")).rejects.toThrow()
        const logged = JSON.stringify(spy.mock.calls)
        expect(logged).toContain("AI_APICallError")
        expect(logged).toContain("500")
        expect(logged).not.toContain("a conversa secreta")
        expect(logged).not.toContain("corpo")
        spy.mockRestore()
    })

    it("não retoma quando o dono já assumiu a conversa, mas grava a memória", async () => {
        mocks.notices = [question("q1", "m1", new Date("2026-11-25T10:00:00Z"))]
        mocks.conversation = { lastOwnerMessageAt: new Date("2026-11-25T11:00:00Z") }
        await answerNotice("q1", "sim", "local")
        await runJobs()
        expect(mocks.createMemory).toHaveBeenCalledTimes(1)
        expect(mocks.turn).not.toHaveBeenCalled()
    })

    it("descartar tira a pergunta das pendentes e audita", async () => {
        mocks.notices = [question("q1", "m1")]
        await discardNotice("q1", "local")
        expect(mocks.notices[0]).toMatchObject({ status: "discarded" })
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ entidadeId: "q1", depois: { acao: "descartar pergunta" } }))
        await expect(discardNotice("q1", "local")).rejects.toThrow("não está mais pendente")
    })
})
