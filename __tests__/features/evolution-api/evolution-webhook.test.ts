import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
    config: { webhookSecret: "s3gredo", defaultInstance: "opex" } as Record<string, string | undefined>,
    seen: new Set<string>(),
    forward: vi.fn(),
    patchState: vi.fn(),
    runAfter: vi.fn(),
    warn: vi.fn(),
    bulkWrite: vi.fn(),
    updateContact: vi.fn(),
    publishChat: vi.fn(),
    ownerJid: null as string | null,
    lidOwner: vi.fn(),
}))

vi.mock("@/lib/after-response", () => ({ runAfterResponse: mocks.runAfter }))
vi.mock("@/features/evolution-api/server/instances", () => ({ evolutionConfig: async () => mocks.config, patchState: mocks.patchState }))
vi.mock("@/features/evolution-api/server/shared", () => ({ evolutionLog: { warn: mocks.warn, info: vi.fn(), error: vi.fn() }, publishEvolution: vi.fn() }))
vi.mock("@/features/evolution-api/server/models", () => ({
    evolutionDb: vi.fn(),
    contactKey: (instance: string, jid: string) => `${instance}:${jid}`,
    EvolutionContact: { bulkWrite: mocks.bulkWrite, updateOne: mocks.updateContact, findOne: (filter: unknown) => ({ select: () => ({ lean: async () => mocks.lidOwner(filter) }) }) },
    EvolutionInstanceState: {
        exists: vi.fn(async () => null),
        findById: () => ({ lean: async () => null, select: () => ({ lean: async () => (mocks.ownerJid ? { ownerJid: mocks.ownerJid } : null) }) }),
    },
    EvolutionSeenEvent: {
        create: vi.fn(async ({ _id }: { _id: string }) => {
            if (mocks.seen.has(_id)) throw Object.assign(new Error("dup"), { code: 11000 })
            mocks.seen.add(_id)
        }),
    },
}))
vi.mock("@/features/secretary-agent/server/inbound", () => ({ handleIncomingMessage: mocks.forward }))
vi.mock("@/features/secretary-agent/server/chat-events", () => ({ publishSecretaryChatUpdated: mocks.publishChat }))

import { POST } from "@/app/api/evolution/webhook/route"
import { processEvolutionEvent } from "@/features/evolution-api/server/webhook"

const message = (id: string) => ({ event: "messages.upsert", instance: "opex", data: { key: { id, remoteJid: "5531999999999@s.whatsapp.net", fromMe: false }, message: { conversation: "oi" } } })
const request = (body: unknown, secret?: string) =>
    new Request("http://opex/api/evolution/webhook", { method: "POST", body: JSON.stringify(body), headers: secret ? { "x-opex-webhook-secret": secret } : {} }) as never

beforeEach(() => {
    mocks.seen.clear()
    mocks.ownerJid = null
    vi.clearAllMocks()
})

describe("POST /api/evolution/webhook", () => {
    it("recusa sem o segredo (401) e não processa", async () => {
        expect((await POST(request(message("A")))).status).toBe(401)
        expect((await POST(request(message("A"), "errado"))).status).toBe(401)
        expect(mocks.runAfter).not.toHaveBeenCalled()
    })

    it("aceita com o segredo e responde 204 antes de processar", async () => {
        const response = await POST(request(message("A"), "s3gredo"))
        expect(response.status).toBe(204)
        expect(mocks.runAfter).toHaveBeenCalledTimes(1)
    })
})

describe("processEvolutionEvent", () => {
    it("descarta a mensagem repetida (mesmo id)", async () => {
        await processEvolutionEvent(message("DUP") as never)
        await processEvolutionEvent(message("DUP") as never)
        expect(mocks.forward).toHaveBeenCalledTimes(1)
    })

    it("ignora e loga evento de instância desconhecida", async () => {
        await processEvolutionEvent({ ...message("X"), instance: "outra" } as never)
        expect(mocks.forward).not.toHaveBeenCalled()
        expect(mocks.warn).toHaveBeenCalledWith(expect.objectContaining({ instance: "outra" }), expect.any(String))
    })

    it("CONNECTION_UPDATE sem o nome não apaga o perfil salvo", async () => {
        await processEvolutionEvent({ event: "connection.update", instance: "opex", data: { state: "open", wuid: "5541984556795@s.whatsapp.net" } } as never)
        const patch = mocks.patchState.mock.calls.map((call) => call[1] as Record<string, unknown>).find((item) => item.state === "open")!
        expect(patch).toMatchObject({ state: "open", ownerJid: "5541984556795@s.whatsapp.net" })
        expect(patch).not.toHaveProperty("profileName")
        expect(patch).not.toHaveProperty("profilePictureUrl")
    })

    it("OPE-197: recebida grava a prévia, soma 1 nas não lidas e avisa a aba Conversas antes do turno", async () => {
        mocks.forward.mockImplementation(async () => expect(mocks.publishChat).toHaveBeenCalledWith("opex", ["5531999999999@s.whatsapp.net"]))
        await processEvolutionEvent(message("P1") as never)
        expect(mocks.updateContact).toHaveBeenCalledWith({ _id: "opex:5531999999999@s.whatsapp.net" }, { $set: { lastMessage: { text: "oi", kind: "text", fromMe: false } }, $inc: { unreadCount: 1 } })
        expect(mocks.forward).toHaveBeenCalledTimes(1)
    })

    it("OPE-197: mensagem do dono zera as não lidas; na conversa consigo mesmo não soma", async () => {
        await processEvolutionEvent({ ...message("P2"), data: { key: { id: "P2", remoteJid: "5531999999999@s.whatsapp.net", fromMe: true }, message: { conversation: "já vou" } } } as never)
        expect(mocks.updateContact).toHaveBeenLastCalledWith(expect.anything(), { $set: { lastMessage: { text: "já vou", kind: "text", fromMe: true }, unreadCount: 0 } })
        mocks.ownerJid = "5541984556795@s.whatsapp.net"
        await processEvolutionEvent({ ...message("P3"), data: { key: { id: "P3", remoteJid: "5541984556795@s.whatsapp.net", fromMe: false }, message: { conversation: "nota" } } } as never)
        expect(mocks.updateContact).toHaveBeenLastCalledWith(expect.anything(), { $set: { lastMessage: { text: "nota", kind: "text", fromMe: false } } })
    })

    it("OPE-197: CHATS_UPDATE grava unreadMessages e avisa a conversa; MESSAGES_UPDATE avisa a conversa", async () => {
        await processEvolutionEvent({ event: "chats.update", instance: "opex", data: [{ remoteJid: "5531999999999@s.whatsapp.net", unreadMessages: 0 }] } as never)
        const ops = mocks.bulkWrite.mock.calls.at(-1)![0] as { updateOne: { update: { $set: Record<string, unknown> } } }[]
        expect(ops[0]!.updateOne.update.$set.unreadCount).toBe(0)
        expect(mocks.publishChat).toHaveBeenCalledWith("opex", ["5531999999999@s.whatsapp.net"])
        await processEvolutionEvent({ event: "messages.update", instance: "opex", data: { keyId: "A", remoteJid: "5521988887777@s.whatsapp.net", status: "READ" } } as never)
        expect(mocks.publishChat).toHaveBeenLastCalledWith("opex", ["5521988887777@s.whatsapp.net"])
    })

    it("OPE-207: @lid com remoteJidAlt grava a correspondência no contato do número e a prévia fica na conversa do número", async () => {
        const lid = "158879933534209@lid"
        const pn = "554196988060@s.whatsapp.net"
        await processEvolutionEvent({ ...message("L1"), data: { key: { id: "L1", remoteJid: lid, remoteJidAlt: pn, fromMe: false }, message: { conversation: "Como foram as interviews?" } } } as never)
        const ops = mocks.bulkWrite.mock.calls.flatMap((call) => call[0] as { updateOne: { filter: { _id: string }; update: { $set: Record<string, unknown> } } }[])
        expect(ops).toContainEqual(expect.objectContaining({ updateOne: expect.objectContaining({ filter: { _id: `opex:${pn}` }, update: expect.objectContaining({ $set: { lidJid: lid } }) }) }))
        expect(mocks.updateContact).toHaveBeenCalledWith({ _id: `opex:${pn}` }, expect.anything())
        expect(mocks.publishChat).toHaveBeenCalledWith("opex", [pn])
    })

    it("OPE-207: @lid sem remoteJidAlt com correspondência conhecida cai na conversa do número; sem correspondência, fica no LID", async () => {
        const lid = "158879933534209@lid"
        const pn = "554196988060@s.whatsapp.net"
        mocks.lidOwner.mockImplementation(async (filter: { lidJid?: string }) => (filter.lidJid === lid ? { jid: pn } : null))
        await processEvolutionEvent({ ...message("L2"), data: { key: { id: "L2", remoteJid: lid, fromMe: true }, message: { conversation: "tudo certo" } } } as never)
        expect(mocks.updateContact).toHaveBeenLastCalledWith({ _id: `opex:${pn}` }, { $set: { lastMessage: { text: "tudo certo", kind: "text", fromMe: true }, unreadCount: 0 } })
        expect(mocks.forward).toHaveBeenLastCalledWith("opex", expect.objectContaining({ chatJid: pn }))
        await processEvolutionEvent({ ...message("L3"), data: { key: { id: "L3", remoteJid: "999@lid", fromMe: false }, message: { conversation: "oi" } } } as never)
        expect(mocks.updateContact).toHaveBeenLastCalledWith({ _id: "opex:999@lid" }, expect.anything())
    })

    it("não grava nem loga a chave que a Evolution manda no corpo", async () => {
        await processEvolutionEvent({ ...message("K"), apikey: "chave-global" } as never)
        expect(JSON.stringify(mocks.patchState.mock.calls)).not.toContain("chave-global")
    })
})
