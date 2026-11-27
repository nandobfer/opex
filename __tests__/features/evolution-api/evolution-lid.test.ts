import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
    findMessages: vi.fn(),
    findContacts: vi.fn(),
    fetchGroups: vi.fn(),
    findChats: vi.fn(),
    bulkWrite: vi.fn(),
    findOne: vi.fn(),
    distinct: vi.fn(),
    upsertContacts: vi.fn(),
}))
vi.mock("@/features/evolution-api/server/client", () => ({
    evolution: { findMessages: mocks.findMessages, findContacts: mocks.findContacts, fetchGroups: mocks.fetchGroups, findChats: mocks.findChats },
    toDomainError: (error: unknown) => {
        throw error
    },
}))
vi.mock("@/features/evolution-api/server/models", () => ({
    evolutionDb: vi.fn(),
    contactKey: (instance: string, jid: string) => `${instance}:${jid}`,
    EvolutionContact: { bulkWrite: mocks.bulkWrite, findOne: (filter: unknown) => ({ select: () => ({ lean: async () => mocks.findOne(filter) }) }), find: (filter: unknown) => ({ select: () => ({ lean: async () => mocks.distinct(filter) }) }) },
}))
vi.mock("@/features/evolution-api/server/instances", () => ({ defaultInstanceName: async () => "opex" }))
vi.mock("@/features/evolution-api/server/shared", () => ({ AcaoAuditoria: { EXECUTAR: "EXECUTAR" }, auditEvolution: vi.fn(), evolutionLog: { info: vi.fn() }, publishEvolution: vi.fn() }))
vi.mock("@/features/evolution-api/server/webhook", () => ({ upsertContacts: mocks.upsertContacts }))

import { lidAliasOf } from "@/features/evolution-api/message"
import { fetchConversationMessages } from "@/features/evolution-api/server/chat"
import { conversationJids, lidAliases, rememberLidAliases } from "@/features/evolution-api/server/lid"
import { syncContacts } from "@/features/evolution-api/server/contacts"

const PN = "554196988060@s.whatsapp.net"
const LID = "158879933534209@lid"
const record = (id: string, seconds: number, remoteJid = PN) => ({ key: { id, remoteJid, fromMe: false }, message: { conversation: id }, messageTimestamp: seconds })
const page = (records: ReturnType<typeof record>[], total = records.length) => ({ total, pages: 1, page: 1, records })

beforeEach(() => {
    vi.clearAllMocks()
    mocks.findOne.mockResolvedValue(null)
})

describe("lidAliasOf (OPE-207)", () => {
    it("@lid com remoteJidAlt de número gera a correspondência (sem dispositivo)", () => {
        expect(lidAliasOf({ remoteJid: LID, remoteJidAlt: "554196988060:12@s.whatsapp.net" })).toEqual({ lid: LID, pn: PN })
    })

    it("sem remoteJidAlt, conversa por número, grupo ou alias que não é número não geram correspondência", () => {
        expect(lidAliasOf({ remoteJid: LID })).toBeNull()
        expect(lidAliasOf({ remoteJid: PN, remoteJidAlt: LID })).toBeNull()
        expect(lidAliasOf({ remoteJid: "120363000000000000@g.us", remoteJidAlt: PN })).toBeNull()
        expect(lidAliasOf({ remoteJid: LID, remoteJidAlt: "999@lid" })).toBeNull()
    })
})

describe("fetchConversationMessages (OPE-207)", () => {
    it("junta as duas metades em ordem decrescente, sem ids repetidos, e corta no limite", async () => {
        mocks.findMessages.mockImplementation(async (_instance: string, input: { remoteJid: string }) =>
            input.remoteJid === LID ? page([record("L2", 400, LID), record("L2", 400, LID), record("L1", 300, LID)]) : page([record("P2", 200), record("P1", 100)]),
        )
        const result = await fetchConversationMessages("opex", [PN, LID], { limit: 3 })
        expect(result.records.map((item) => item.key.id)).toEqual(["L2", "L1", "P2"])
        expect(result.hasOlder).toBe(true)
        expect(result.nextBefore).toEqual(new Date(200 * 1000))
        expect(mocks.findMessages).toHaveBeenCalledWith("opex", { remoteJid: PN, pageSize: 3 }, undefined)
    })

    it("tudo cabe na página: sem anteriores e sem cursor", async () => {
        mocks.findMessages.mockResolvedValue(page([record("A", 100)]))
        const result = await fetchConversationMessages("opex", [PN], { limit: 50 })
        expect(result).toEqual({ records: [expect.objectContaining({ key: expect.objectContaining({ id: "A" }) })], hasOlder: false, nextBefore: null })
    })

    it("fonte com mais registros do que os trazidos marca anteriores; com `before`, consulta até ele", async () => {
        mocks.findMessages.mockResolvedValue(page([record("B", 500), record("A", 450)], 80))
        const before = new Date(600 * 1000)
        const result = await fetchConversationMessages("opex", [PN], { limit: 50, before })
        expect(mocks.findMessages).toHaveBeenCalledWith("opex", { remoteJid: PN, pageSize: 50, from: new Date(0), to: before }, undefined)
        expect(result.hasOlder).toBe(true)
        expect(result.nextBefore).toEqual(new Date(450 * 1000))
    })

    it("cursor preso no mesmo segundo recua 1 s (não repete a página para sempre)", async () => {
        mocks.findMessages.mockResolvedValue(page([record("A", 500), record("B", 500)], 120))
        const result = await fetchConversationMessages("opex", [PN], { limit: 2, before: new Date(500 * 1000) })
        expect(result.nextBefore).toEqual(new Date(499 * 1000))
    })
})

describe("correspondência LID ↔ número (OPE-207)", () => {
    it("conversationJids: número com LID conhecido, LID com número conhecido e JID sem correspondência", async () => {
        mocks.findOne.mockImplementation(async (filter: { jid?: string; lidJid?: string }) => (filter.jid === PN ? { lidJid: LID } : filter.lidJid === LID ? { jid: PN } : null))
        expect(await conversationJids("opex", PN)).toEqual([PN, LID])
        expect(await conversationJids("opex", LID)).toEqual([PN, LID])
        expect(await conversationJids("opex", "5531999999999@s.whatsapp.net")).toEqual(["5531999999999@s.whatsapp.net"])
        expect(await conversationJids("opex", "120363000000000000@g.us")).toEqual(["120363000000000000@g.us"])
    })

    it("rememberLidAliases grava lidJid no contato do número e o marca como conversa; lidAliases devolve LID → número", async () => {
        mocks.bulkWrite.mockResolvedValue({ modifiedCount: 1, upsertedCount: 0 })
        expect(await rememberLidAliases("opex", [{ lid: LID, pn: PN }, { lid: LID, pn: PN }])).toBe(1)
        const ops = mocks.bulkWrite.mock.calls[0]![0] as { updateOne: { filter: unknown; update: { $set: unknown } } }[]
        expect(ops).toHaveLength(1)
        expect(ops[0]!.updateOne.filter).toEqual({ _id: `opex:${PN}` })
        expect(ops[0]!.updateOne.update.$set).toEqual({ lidJid: LID, hasChat: true })
        mocks.distinct.mockResolvedValue([{ jid: PN, lidJid: LID }, { jid: "5531999999999@s.whatsapp.net", lidJid: null }])
        expect(await lidAliases("opex")).toEqual(new Map([[LID, PN]]))
    })

    it("Sincronizar preenche a correspondência das conversas @lid cuja última mensagem traz o número, mesmo só com o chat LID (a metade do número vira conversa)", async () => {
        mocks.findContacts.mockResolvedValue([])
        mocks.fetchGroups.mockResolvedValue([])
        mocks.findChats.mockResolvedValue([
            { remoteJid: LID, lastMessage: { key: { id: "M", remoteJid: LID, remoteJidAlt: PN, fromMe: false } } },
            { remoteJid: "777@lid", lastMessage: { key: { id: "N", remoteJid: "777@lid", fromMe: true } } },
        ])
        mocks.bulkWrite.mockResolvedValue({ modifiedCount: 1, upsertedCount: 0 })
        await syncContacts("local")
        const ops = mocks.bulkWrite.mock.calls[0]![0] as { updateOne: { filter: unknown; update: { $set: unknown } } }[]
        expect(ops.map((op) => [op.updateOne.filter, op.updateOne.update.$set])).toEqual([[{ _id: `opex:${PN}` }, { lidJid: LID, hasChat: true }]])
    })
})
