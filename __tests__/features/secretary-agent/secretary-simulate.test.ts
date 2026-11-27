import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { DEFAULT_SECRETARY_SETTINGS, simulateSchema, type SecretarySettings } from "@/features/secretary-agent/schemas"

const CONTACT = "5531999999999@s.whatsapp.net"

const mocks = vi.hoisted(() => ({
    inference: vi.fn(),
    decideSubject: vi.fn(),
    findMessages: vi.fn(async () => ({ records: [] as unknown[] })),
    send: vi.fn(),
    markAsRead: vi.fn(),
    record: vi.fn(),
    countDecisions: vi.fn(async () => 3),
    pausedUntil: null as Date | null,
    contacts: vi.fn(async (): Promise<Map<string, { name: string }>> => new Map([["5531999999999@s.whatsapp.net", { name: "Alfredo Petri" }]])),
    memory: vi.fn<(...args: unknown[]) => Promise<{ block: string; counts: { full: number; titles: number; overflow: number } }>>(async () => ({ block: "- Ana é vizinha", counts: { full: 1, titles: 2, overflow: 0 } })),
}))
vi.mock("@/features/evolution-api/server/contacts", () => ({ contactsByJid: mocks.contacts }))

vi.mock("ai", () => ({ dynamicTool: (tool: unknown) => tool }))
vi.mock("@/features/auth/server/context", () => ({ requireAdminSession: vi.fn() }))
vi.mock("@nandobfer/integracoes/modules/integrations/ia/models/AiConsumption", () => ({ AiConsumption: { aggregate: async (pipeline: [{ $match: { subject?: string } }]) => (pipeline[0].$match.subject ? [{ total: 0.002 }] : [{ total: 1 }]) } }))
vi.mock("@nandobfer/integracoes/modules/integrations/ia/models/AiUsageLog", () => ({ AiUsageLog: { aggregate: async () => [] } }))
vi.mock("@/features/ai/server/agent-memory-context", () => ({ agentMemoryContext: mocks.memory }))
vi.mock("@/features/evolution-api/server/client", () => ({ evolution: { findMessages: mocks.findMessages, sendText: mocks.send, markAsRead: mocks.markAsRead } }))
vi.mock("@/features/secretary-agent/server/ai", () => ({ secretaryInference: mocks.inference }))
vi.mock("@/features/secretary-agent/server/decide-subject", () => ({ decideSubject: mocks.decideSubject }))
vi.mock("@/features/secretary-agent/server/personality", () => ({ loadPersonality: async () => ({ snapshot: { base: { blocks: [] }, variants: [{ jid: CONTACT, title: "Vizinha", blocks: [] }] } }) }))
vi.mock("@/features/secretary-agent/server/models", () => ({
    secretaryDb: async () => undefined,
    SecretaryDecisionRecord: { countDocuments: mocks.countDecisions, create: mocks.record },
    SecretaryConversation: { findById: () => ({ select: () => ({ lean: async () => ({ pausedUntil: mocks.pausedUntil }) }) }) },
}))

import { simulateSecretary } from "@/features/secretary-agent/server/simulate"
import { POST } from "@/app/api/secretary/simulate/route"

const MONEY = { id: "dinheiro", name: "Dinheiro", description: "", examples: [] }
function settings(patch: Partial<SecretarySettings> = {}): SecretarySettings {
    return { ...DEFAULT_SECRETARY_SETTINGS, enabled: false, instance: "opex", main: { ...DEFAULT_SECRETARY_SETTINGS.main, provider: "opencode-go", model: "m" }, ...patch }
}
const run = (input: Record<string, unknown> = {}) => simulateSecretary(simulateSchema.parse({ settings: settings(), jid: CONTACT, message: "oi, tudo bem?", ...input }))

beforeEach(() => {
    vi.clearAllMocks()
    mocks.pausedUntil = null
    mocks.inference.mockImplementation(async (options: { tools?: Record<string, { execute: (raw: unknown) => Promise<unknown> }> }) => {
        await options.tools?.remember?.execute({ lista: "secretary-conversation", texto: "Ana vai viajar sexta" })
        return { text: "oi!\n\ntudo sim", question: "Ana pergunta se você vai na festa?" }
    })
})

describe("simulateSecretary", () => {
    it("responde 502 com diagnóstico seguro quando a inferência falha", async () => {
        mocks.inference.mockRejectedValueOnce(Object.assign(new Error("mensagem privada"), { statusCode: 400 }))
        const req = new NextRequest("http://localhost/api/secretary/simulate", { method: "POST", body: JSON.stringify({ settings: settings(), jid: CONTACT, message: "oi" }) })
        const response = await POST(req, { params: Promise.resolve({}) })
        expect(response.status).toBe(502)
        const body = await response.text()
        expect(body).toContain("SECRETARY_PROVIDER_ERROR")
        expect(body).toContain("OpenCode Go recusou a chamada (HTTP 400)")
        expect(body).not.toContain("mensagem privada")
    })
    it("responde com as configurações enviadas, sem enviar, marcar como lida, gravar decisão nem memória", async () => {
        const result = await run()
        expect(result.replies).toEqual(["oi!", "tudo sim"])
        expect(result.decision).toMatchObject({ decision: "reply", label: "Responderia" })
        expect(result.memories.written).toEqual([{ channel: "Desta conversa", title: "Ana vai viajar sexta", text: "Ana vai viajar sexta" }])
        expect(result.memories.counts).toEqual({ full: 1, titles: 2, overflow: 0 })
        expect(result.question).toBe("Ana pergunta se você vai na festa?")
        expect(result.personality.variant).toBe("Vizinha")
        expect(result.costUsd).toBe(0.002)
        expect(mocks.send).not.toHaveBeenCalled()
        expect(mocks.markAsRead).not.toHaveBeenCalled()
        expect(mocks.record).not.toHaveBeenCalled()
        expect(mocks.inference).toHaveBeenCalledWith(expect.objectContaining({ origin: "secretary-simulation" }))
    })

    it("devolve o rastro de quando não responderia, com passos e assunto, e limites informativos", async () => {
        mocks.pausedUntil = new Date(Date.now() + 60_000)
        mocks.decideSubject.mockResolvedValueOnce({ decider: "jev", provider: "jev", model: "jev-1", decision: { blocked: ["dinheiro"], allowed: [], topic: "Dinheiro", reason: null }, answers: [{ id: "dinheiro", kind: "blocked", name: "Dinheiro", value: 0.9, band: "yes" }] })
        const result = await simulateSecretary(simulateSchema.parse({ settings: settings({ criteria: { ...DEFAULT_SECRETARY_SETTINGS.criteria, subjects: { mode: "any", blocked: [MONEY], allowed: [] } } }), jid: CONTACT, message: "me empresta 50?" }))
        expect(result.replies).toEqual([])
        expect(result.decision).toMatchObject({ decision: "skip", rule: "subject-blocked", label: "Não responderia" })
        expect(result.steps.find((step) => step.id === "subject-blocked")?.outcome).toBe("fail")
        expect(result.subject?.answers[0]?.band).toBe("yes")
        expect(result.limits).toMatchObject({ repliesLastHour: 3, repliesPerHour: 20 })
        expect(result.pausedUntil).not.toBeNull()
        expect(mocks.inference).not.toHaveBeenCalled()
        expect(mocks.decideSubject).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ origin: "secretary-simulation" }))
    })

    it("o agente recebe o nome do contato escolhido e devolve o contato no rastro", async () => {
        const result = await run({ message: "oi" })
        const call = mocks.inference.mock.calls[0]?.[0] as { instructions: string; messages: { content: string }[] }
        expect(call.instructions).toContain("Você está falando com Alfredo Petri (+5531999999999). Se o nome é conhecido, não pergunte quem é")
        expect(JSON.parse(call.messages[0]!.content).contact).toEqual({ nome: "Alfredo Petri", numero: "+5531999999999" })
        expect(mocks.contacts).toHaveBeenCalledWith([CONTACT], "opex")
        expect(mocks.memory).toHaveBeenCalledWith("secretario", expect.anything(), { focus: "Alfredo Petri\noi" })
        expect(result.contact).toEqual({ name: "Alfredo Petri", number: "5531999999999", isGroup: false, groupName: null, author: null })
    })

    it("com o cache de contatos fora, segue só com o número e o nome desconhecido", async () => {
        mocks.contacts.mockRejectedValueOnce(new Error("banco fora"))
        const result = await run()
        const call = mocks.inference.mock.calls[0]?.[0] as { instructions: string; messages: { content: string }[] }
        expect(call.instructions).toContain("nome desconhecido (só o número) (+5531999999999)")
        expect(call.instructions).not.toContain("não pergunte quem é")
        expect(JSON.parse(call.messages[0]!.content).contact.nome).toBe("nome desconhecido (só o número)")
        expect(result.contact?.name).toBeNull()
    })

    it("o histórico real só é lido quando pedido", async () => {
        await run()
        expect(mocks.findMessages).not.toHaveBeenCalled()
        await run({ useRealHistory: true })
        expect(mocks.findMessages).toHaveBeenCalledWith("opex", expect.objectContaining({ remoteJid: CONTACT }))
    })

    it("sem modelo do agente, pede para escolher antes de simular", async () => {
        await expect(simulateSecretary(simulateSchema.parse({ settings: settings({ main: DEFAULT_SECRETARY_SETTINGS.main }), jid: CONTACT, message: "oi" }))).rejects.toThrow("Escolha o provedor e o modelo")
    })
})
