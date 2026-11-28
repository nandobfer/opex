import { describe, expect, it, vi } from "vitest"

vi.mock("@/features/engramind/server/pending-writes", () => ({ enqueuePendingWrite: vi.fn(), isEngramindUnavailable: () => false }))

import { pendingOpOfTool } from "@/features/secretary-agent/server/memory-queue"
import { secretaryChannelLabels } from "@/features/engramind/network/channel-labels"
import { conversationFocus } from "@/features/secretary-agent/memory-focus"
import { mentionsOwner, parseEvolutionMessage } from "@/features/evolution-api/message"
import { ownerLidOf } from "@/features/evolution-api/server/webhook"
import { LEGACY_NAMESPACE as L } from "@/features/engramind/channel-namespace"

describe("pendingOpOfTool", () => {
    it("traduz cada ferramenta de gravação na operação pendente", () => {
        expect(pendingOpOfTool("remember", { lista: "secretary-global", texto: "x" })).toEqual({ op: "create", texto: "x" })
        expect(pendingOpOfTool("update_my_memory", { memoryId: "m1", texto: "y", categoria: "PROJECT_RULES" })).toEqual({ op: "update", memoryId: "m1", patch: { texto: "y", categoria: "PROJECT_RULES" } })
        expect(pendingOpOfTool("set_my_memory_active", { memoryId: "m1", ativa: false })).toEqual({ op: "update", memoryId: "m1", patch: { ativa: false } })
    })

    it("leitura e exclusão não entram na fila", () => {
        expect(pendingOpOfTool("list_my_memories", {})).toBeNull()
        expect(pendingOpOfTool("forget_my_memory", { memoryId: "m1" })).toBeNull()
        expect(pendingOpOfTool("update_my_memory", { texto: "sem id" })).toBeNull()
    })
})

describe("secretaryChannelLabels", () => {
    it("rotula o canal de contato, grupo e lid pelo nome, com o número na dica", () => {
        const labels = secretaryChannelLabels([
            { jid: "5531999999999@s.whatsapp.net", name: "Mãe", number: "5531999999999", isGroup: false },
            { jid: "120363000000000001@g.us", name: "Família", number: null, isGroup: true },
            { jid: "123456789@lid", name: "Sem número", number: "123456789", isGroup: false },
            { jid: "status@broadcast", name: "Status", number: null, isGroup: false },
        ], L)
        expect(labels.get("agentes/secretario/conversas/5531999999999")).toEqual({ title: "Mãe", hint: "+5531999999999 · Agente Secretário" })
        expect(labels.get("agentes/secretario/conversas/g-120363000000000001")).toEqual({ title: "Família", hint: "Grupo · Agente Secretário" })
        expect(labels.get("agentes/secretario/conversas/lid-123456789")?.title).toBe("Sem número")
        expect(labels.size).toBe(3)
    })
})

describe("conversationFocus (abrir as memórias da conversa)", () => {
    it("foca o global do Secretário e o canal da conversa, criando nela", () => {
        expect(conversationFocus("g-120363000000000001", { app: "alfredopex", prefixed: true })?.defaultCreateChannel).toBe("alfredopex/agentes/secretario/conversas/g-120363000000000001")
        expect(conversationFocus("g-120363000000000001", L)).toEqual({
            channels: ["agentes/secretario/global", "agentes/secretario/conversas/g-120363000000000001"],
            defaultCreateChannel: "agentes/secretario/conversas/g-120363000000000001",
        })
        expect(conversationFocus("../x", L)).toBeNull()
        expect(conversationFocus(null, L)).toBeNull()
    })
})

describe("menção ao dono pelo LID", () => {
    it("aprende o LID do dono numa mensagem dele em grupo", () => {
        expect(ownerLidOf({ key: { id: "1", remoteJid: "1203@g.us", fromMe: true, participant: "999:2@lid" } })).toBe("999@lid")
        expect(ownerLidOf({ key: { id: "2", remoteJid: "1203@g.us", fromMe: false, participant: "999@lid" } })).toBeNull()
        expect(ownerLidOf({ key: { id: "3", remoteJid: "5531@s.whatsapp.net", fromMe: true } })).toBeNull()
    })

    it("menção ou citação por LID conta como menção ao dono", () => {
        const mention = parseEvolutionMessage({ key: { id: "A", remoteJid: "1203@g.us", fromMe: false, participant: "5531@s.whatsapp.net" }, message: { extendedTextMessage: { text: "@999 viu?" } }, contextInfo: { mentionedJid: ["999@lid"] } })
        const quote = parseEvolutionMessage({ key: { id: "B", remoteJid: "1203@g.us", fromMe: false, participant: "5531@s.whatsapp.net" }, message: { conversation: "isso" }, contextInfo: { stanzaId: "Q", participant: "999@lid" } })
        expect(mentionsOwner(mention, "5531988887777@s.whatsapp.net", "999@lid")).toBe(true)
        expect(mentionsOwner(quote, "5531988887777@s.whatsapp.net", "999@lid")).toBe(true)
        expect(mentionsOwner(mention, "5531988887777@s.whatsapp.net")).toBe(false)
    })
})
