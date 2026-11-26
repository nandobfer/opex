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
    decideSubject: vi.fn(),
    readMedia: vi.fn(async (_settings: unknown, _instance: string, message: ParsedMessage) => ({ text: message.text || "[áudio]", understood: false })),
    inference: vi.fn(),
    decide: vi.fn(),
    decisionsById: new Map<string, string>(),
    costsById: new Map<string, number | undefined>(),
    send: vi.fn(async () => "S1"),
    sendOwner: vi.fn(async () => "S2"),
    askOwner: vi.fn(),
    markAsRead: vi.fn(),
    presence: vi.fn(),
    noticeUpsert: vi.fn(async () => ({ upsertedCount: 1 })),
    memoryTools: [] as unknown[],
    enqueue: vi.fn(async () => "pendente:x"),
    contacts: vi.fn(async (): Promise<Map<string, { name: string }>> => new Map([["5531999999999@s.whatsapp.net", { name: "Alfredo Petri" }], ["123@g.us", { name: "Família" }], ["5531911112222@s.whatsapp.net", { name: "João Silva" }]])),
}))
vi.mock("@/features/evolution-api/server/contacts", () => ({ contactsByJid: mocks.contacts }))

vi.mock("node:timers/promises", () => ({ setTimeout: vi.fn(async () => undefined) }))
vi.mock("ai", () => ({ dynamicTool: (tool: unknown) => tool }))
vi.mock("@/lib/db/models/AiConsumption", () => ({ AiConsumption: { aggregate: async () => [{ total: mocks.spent }] } }))
vi.mock("@/features/ai/server/agent-memory-context", () => ({ agentMemoryContext: async () => ({ block: "" }) }))
vi.mock("@/features/ai/server/self-memory/settings", () => ({ selfMemoryEnabled: async () => true }))
vi.mock("@/features/ai/server/self-memory/tools", () => ({ selfMemoryTools: () => mocks.memoryTools }))
vi.mock("@/features/engramind/server/pending-writes", () => ({ enqueuePendingWrite: mocks.enqueue, isEngramindUnavailable: (error: { code?: string }) => error?.code === "ENGRAMIND_UNREACHABLE" }))
vi.mock("@/features/evolution-api/server/client", () => ({
    evolution: { findMessages: async () => ({ records: [] }), markAsRead: mocks.markAsRead, sendPresence: mocks.presence },
}))
vi.mock("@/lib/pusher/channels", () => ({ publishAppEvent: vi.fn() }))
vi.mock("@/features/secretary-agent/server/inbound", async (original) => {
    const actual = (await original()) as typeof import("@/features/secretary-agent/server/inbound")
    mocks.decide.mockImplementation(actual.recordDecision)
    return { ...actual, recordDecision: mocks.decide }
})
vi.mock("@/features/secretary-agent/server/settings", () => ({ loadSecretarySettings: async () => ({ settings: mocks.settings }) }))
vi.mock("@/lib/db/models/Ai", () => ({ AiUsageLog: { aggregate: async () => [] } }))
vi.mock("@/features/secretary-agent/server/decide-subject", () => ({ decideSubject: mocks.decideSubject }))
vi.mock("@/features/secretary-agent/server/ai", () => ({ secretaryInference: mocks.inference }))
vi.mock("@/features/secretary-agent/server/media", () => ({ readTurnMedia: mocks.readMedia }))
vi.mock("@/features/secretary-agent/server/personality", () => ({ loadPersonality: async () => ({ snapshot: { base: { blocks: [] }, variants: [] } }) }))
vi.mock("@/features/secretary-agent/server/owner-questions", () => ({ askOwner: mocks.askOwner, publishNotices: vi.fn(), sendSecretaryText: mocks.send, sendOwnerText: mocks.sendOwner }))
vi.mock("@/features/secretary-agent/server/models", () => ({
    SecretaryConversation: {
        findOneAndUpdate: () => ({ lean: async () => mocks.state }),
        exists: async () => (++mocks.currentCalls > mocks.currentAfter ? null : mocks.current ? { _id: "x" } : null),
        updateOne: vi.fn(),
    },
    SecretaryDecisionRecord: {
        countDocuments: async () => mocks.replies,
        updateOne: async (filter: { _id: string }, update: { $set: { decision: string; costUsd?: number } }) => { mocks.decisionsById.set(filter._id, update.$set.decision); mocks.costsById.set(filter._id, update.$set.costUsd) },
    },
    SecretaryNotice: { updateOne: mocks.noticeUpsert },
}))

import { z } from "zod"
import { DomainError } from "@/lib/api/route"
import { runSecretaryTurn } from "@/features/secretary-agent/server/turn"

function msg(patch: Partial<ParsedMessage> = {}): ParsedMessage {
    return { id: "M1", chatJid: CONTACT, fromMe: false, isGroup: false, participant: null, pushName: "Ana", text: "oi, tudo bem?", media: null, quotedId: null, quotedAuthor: null, mentioned: [], timestamp: new Date(), ignorable: false, ...patch }
}
const turn = (message = msg(), ownerAnswer?: string) => runSecretaryTurn({ id: "opex:5531999999999", instance: "opex", chatId: "5531999999999", ownerJid: "5531988887777@s.whatsapp.net", token: "T", message, ownerAnswer })
const decisions = () => mocks.decide.mock.calls.map((call) => call[3])
const MONEY = { id: "dinheiro", name: "Dinheiro", description: "", examples: [] }
const withCriteria = (patch: { audience?: object; subjects?: object }) => {
    const criteria = mocks.settings.criteria as typeof DEFAULT_SECRETARY_SETTINGS.criteria
    mocks.settings = { ...mocks.settings, criteria: { audience: { ...criteria.audience, ...patch.audience }, subjects: { ...criteria.subjects, ...patch.subjects } } }
}

beforeEach(() => {
    vi.clearAllMocks()
    mocks.decisionsById.clear()
    mocks.costsById.clear()
    Object.assign(mocks, { state: { pending: [msg()], lastOwnerMessageAt: null, pausedUntil: null }, current: true, currentAfter: Infinity, currentCalls: 0, replies: 0, spent: 0, subject: null })
    mocks.settings = {
        ...DEFAULT_SECRETARY_SETTINGS,
        enabled: true,
        instance: "opex",
        main: { ...DEFAULT_SECRETARY_SETTINGS.main, provider: "opencode-go", model: "m" },
        criteria: DEFAULT_SECRETARY_SETTINGS.criteria,
    }
    mocks.decideSubject.mockImplementation(async () => ({ decider: "model", provider: "opencode-go", model: "m", decision: mocks.subject ?? { blocked: [], allowed: [], topic: null, reason: null }, answers: [] }))
    mocks.inference.mockResolvedValue({ text: "oi!\n\ntudo sim", question: null })
    mocks.memoryTools = []
})

describe("runSecretaryTurn", () => {
    it("sem frase de espera, a pergunta ainda chega ao dono e nada vai ao contato", async () => {
        mocks.inference.mockResolvedValueOnce({ text: "", question: "Você vai na festa?" })
        await turn()
        expect(mocks.askOwner).toHaveBeenCalledWith(expect.objectContaining({ question: "Você vai na festa?" }))
        expect(mocks.send).not.toHaveBeenCalled()
        expect(decisions()).toEqual(["asked-owner"])
    })

    it("grava na decisão o custo das chamadas do turno (assunto = token)", async () => {
        mocks.spent = 0.0123
        await turn()
        expect(mocks.inference).toHaveBeenCalledWith(expect.objectContaining({ subject: "T" }))
        expect(mocks.costsById.get("opex:M1")).toBe(0.0123)
    })

    it("diz ao modelo com quem está falando e que não pergunte quem é", async () => {
        await turn()
        const call = mocks.inference.mock.calls[0]?.[0] as { instructions: string; messages: { content: string }[] }
        expect(call.instructions).toContain("Você está falando com Alfredo Petri (+5531999999999). Se o nome é conhecido, não pergunte quem é")
        expect(JSON.parse(call.messages[0]!.content).contact).toEqual({ nome: "Alfredo Petri", numero: "+5531999999999" })
        expect(mocks.contacts).toHaveBeenCalledWith([CONTACT], "opex")
    })

    it("em grupo, manda o nome do grupo e o autor separados", async () => {
        withCriteria({ audience: { groups: true, groupReply: "always" } })
        const message = msg({ chatJid: "123@g.us", isGroup: true, participant: "5531911112222@s.whatsapp.net", pushName: "João" })
        mocks.state = { pending: [message], lastOwnerMessageAt: null, pausedUntil: null }
        await turn(message)
        const call = mocks.inference.mock.calls[0]?.[0] as { instructions: string; messages: { content: string }[] }
        expect(call.instructions).toContain("Você está falando no grupo Família; quem escreveu foi João Silva.")
        expect(JSON.parse(call.messages[0]!.content).contact).toEqual({ nome: "Família", numero: null, grupo: "Família", autor: "João Silva" })
    })

    it("com o cache de contatos fora, segue com o nome do WhatsApp e o número", async () => {
        mocks.contacts.mockRejectedValueOnce(new Error("banco fora"))
        await turn()
        expect(mocks.inference.mock.calls[0]?.[0].instructions).toContain("Você está falando com Ana (+5531999999999).")
        expect(decisions()).toEqual(["replied"])
    })

    it("registra a retomada da mesma mensagem sem sobrescrever a pergunta ao dono", async () => {
        const message = msg()
        mocks.inference.mockResolvedValueOnce({ text: "vou conferir", question: "Você vai?" })
        await turn(message)
        await turn(message, "sim")
        expect([...mocks.decisionsById]).toEqual([["opex:M1", "asked-owner"], ["opex:M1:resume", "replied"]])
    })

    it("instrui a responder em primeira pessoa sem se apresentar como assistente", async () => {
        await turn()
        expect(mocks.inference.mock.calls[0]?.[0].instructions).toMatch(/próprio dono.*primeira pessoa.*Não se apresente como assistente nem como IA/)
    })
    it("registra a falha do provedor com diagnóstico seguro sem enviar", async () => {
        mocks.inference.mockRejectedValueOnce(Object.assign(new Error("mensagem privada"), { statusCode: 400 }))
        await turn()
        expect(decisions()).toEqual(["error"])
        expect(mocks.decide.mock.calls[0]?.[4]).toContain("OpenCode Go recusou a chamada (HTTP 400)")
        expect(mocks.decide.mock.calls[0]?.[4]).not.toContain("mensagem privada")
        expect(mocks.send).not.toHaveBeenCalled()
    })
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
        ["em \"Nunca responder a\"", () => withCriteria({ audience: { blocked: [CONTACT] } }), "ignored"],
        ["pausada", () => (mocks.state = { ...mocks.state, pausedUntil: new Date(Date.now() + 60_000) }), "paused"],
        ["com assunto bloqueado", () => { withCriteria({ subjects: { blocked: [MONEY] } }); mocks.subject = { blocked: ["dinheiro"], allowed: [], topic: "Dinheiro", reason: null } }, "subject-blocked"],
        ["só observar", () => (mocks.settings = { ...mocks.settings, mode: "observe" }), "observe-only"],
        ["limite atingido", () => (mocks.replies = 20), "limit-reached"],
        ["fora dos escolhidos", () => withCriteria({ audience: { mode: "selected", selected: ["5531000000000@s.whatsapp.net"] } }), "ignored"],
    ])("conversa %s não é respondida nem marcada como lida", async (_label, setup, decision) => {
        setup()
        await turn()
        expect(decisions()).toEqual([decision])
        expect(mocks.markAsRead).not.toHaveBeenCalled()
        expect(mocks.send.mock.calls.filter((call) => (call as unknown[])[1] === CONTACT)).toHaveLength(0)
    })

    it("assunto bloqueado não avisa o dono", async () => {
        withCriteria({ subjects: { blocked: [MONEY] } })
        mocks.subject = { blocked: ["dinheiro"], allowed: [], topic: null, reason: null }
        await turn()
        expect(mocks.send).not.toHaveBeenCalled()
        expect(mocks.askOwner).not.toHaveBeenCalled()
    })

    it("limite atingido avisa o dono uma vez por janela", async () => {
        mocks.replies = 20
        await turn()
        mocks.noticeUpsert.mockResolvedValueOnce({ upsertedCount: 0 })
        await turn()
        // O aviso vai ao dono pelo envio no formato do WhatsApp (OPE-199), com o texto de sempre (R3).
        expect(mocks.sendOwner).toHaveBeenCalledTimes(1)
        expect(mocks.sendOwner).toHaveBeenCalledWith("opex", "5531988887777@s.whatsapp.net", "Limite de 20 respostas por hora nesta conversa atingido")
        expect(mocks.send).not.toHaveBeenCalled()
        expect((mocks.noticeUpsert.mock.calls[0] as unknown[])[0]).toMatchObject({ _id: expect.stringMatching(/^limit:5531999999999:/) })
    })

    it("a resposta ao contato sai literal, sem a conversão do formato do dono (OPE-199)", async () => {
        mocks.inference.mockResolvedValueOnce({ text: "**ok**, [site](https://x.com)", question: null })
        await turn()
        expect(mocks.send).toHaveBeenCalledWith("opex", CONTACT, "**ok**, [site](https://x.com)")
        expect(mocks.sendOwner).not.toHaveBeenCalled()
    })

    it("instrui o modelo a escrever a pergunta ao dono no formato do WhatsApp (OPE-199, R2)", async () => {
        await turn()
        expect(mocks.inference.mock.calls[0]?.[0].instructions).toContain("A pergunta ao dono (campo question) usa a formatação do WhatsApp")
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

    it("expõe as ferramentas de memória sem forget_my_memory, recusa lista inválida e enfileira com o Engramind fora", async () => {
        const lista = z.enum(["secretary-global", "secretary-conversation"])
        const execute = vi.fn(async () => ({ ok: true }))
        const tool = (name: string) => ({ name, description: name, input: z.object({ lista, texto: z.string().optional(), memoryId: z.string().optional() }), execute })
        mocks.memoryTools = ["list_my_memories", "remember", "update_my_memory", "set_my_memory_active", "forget_my_memory"].map(tool)
        let tools: Record<string, { execute: (raw: unknown) => Promise<unknown> }> = {}
        mocks.inference.mockImplementation(async (input: { tools?: typeof tools }) => {
            tools = input.tools ?? tools
            return { text: "oi", question: null }
        })
        await turn()
        expect(Object.keys(tools).sort()).toEqual(["list_my_memories", "remember", "set_my_memory_active", "update_my_memory"])
        await expect(tools.remember!.execute({ lista: "opex", texto: "x" })).rejects.toThrow()
        execute.mockRejectedValueOnce(new DomainError(503, "fora", "ENGRAMIND_UNREACHABLE"))
        expect(await tools.remember!.execute({ lista: "secretary-conversation", texto: "Ana é vizinha" })).toEqual({ pendente: true, id: "pendente:x" })
        expect(mocks.enqueue).toHaveBeenCalledWith(expect.objectContaining({ channel: "agentes/secretario/conversas/5531999999999", list: "secretary-conversation", write: { op: "create", texto: "Ana é vizinha" } }))
    })

    it("em grupo com \"só quando mencionado\", a menção pelo LID do dono conta", async () => {
        const GROUP = "120363000000000001@g.us"
        const message = msg({ chatJid: GROUP, isGroup: true, text: "@999 viu?", mentioned: ["999@lid"] })
        mocks.state = { pending: [message], lastOwnerMessageAt: null, pausedUntil: null }
        withCriteria({ audience: { groups: true, groupReply: "mention" } })
        await runSecretaryTurn({ id: "opex:g-120363000000000001", instance: "opex", chatId: "g-120363000000000001", ownerJid: "5531988887777@s.whatsapp.net", ownerLid: "999@lid", token: "T", message })
        expect(decisions()).toEqual(["replied"])
    })

    it("quem está fora dos escolhidos não é respondido mesmo com assunto liberado, e o decisor nem é chamado", async () => {
        withCriteria({ audience: { mode: "selected", selected: ["5531000000000@s.whatsapp.net"] }, subjects: { mode: "only", allowed: [MONEY] } })
        mocks.subject = { blocked: [], allowed: ["dinheiro"], topic: "Dinheiro", reason: null }
        await turn()
        expect(decisions()).toEqual(["ignored"])
        expect(mocks.readMedia).not.toHaveBeenCalled()
        expect(mocks.decideSubject).not.toHaveBeenCalled()
    })

    it("não baixa nem transcreve áudio de grupo sem menção", async () => {
        const message = msg({ chatJid: "120363000000000001@g.us", isGroup: true, text: "", media: { kind: "audio", mimetype: "audio/ogg", fileName: null } })
        mocks.state = { pending: [message], lastOwnerMessageAt: null, pausedUntil: null }
        mocks.settings = { ...mocks.settings, media: { ...DEFAULT_SECRETARY_SETTINGS.media, transcribeAudio: true } }
        withCriteria({ audience: { groups: true, groupReply: "mention" } })
        await runSecretaryTurn({ id: "opex:g-120363000000000001", instance: "opex", chatId: "g-120363000000000001", ownerJid: "5531988887777@s.whatsapp.net", token: "T", message })
        expect(decisions()).toEqual(["ignored"])
        expect(mocks.readMedia).not.toHaveBeenCalled()
    })

    it("com \"Só os assuntos liberados\", responde ao assunto liberado e ignora o resto", async () => {
        withCriteria({ subjects: { mode: "only", allowed: [MONEY] } })
        mocks.subject = { blocked: [], allowed: ["dinheiro"], topic: "Dinheiro", reason: null }
        await turn()
        expect(decisions()).toEqual(["replied"])
        vi.clearAllMocks()
        mocks.subject = { blocked: [], allowed: [], topic: "Futebol", reason: null }
        await turn()
        expect(decisions()).toEqual(["subject-blocked"])
    })

    it("falha de quem decide o assunto vira a decisão de erro, sem responder", async () => {
        withCriteria({ subjects: { blocked: [MONEY] } })
        mocks.decideSubject.mockRejectedValueOnce(new Error("O JEV não respondeu"))
        await turn()
        expect(decisions()).toEqual(["error"])
        expect(mocks.send).not.toHaveBeenCalled()
    })

    it("o orçamento soma o gasto das respostas e das decisões", async () => {
        mocks.spent = 5
        await turn()
        expect(decisions()).toEqual(["limit-reached"])
    })
})
