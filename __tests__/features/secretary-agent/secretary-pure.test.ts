import { describe, expect, it } from "vitest"
import { conversationIdOfJid, jidOfConversationId } from "@/features/secretary-agent/conversation-id"
import { randomDelayMs, splitMessages } from "@/features/secretary-agent/split"
import { checkLimits, dayKey, startOfDayIn } from "@/features/secretary-agent/limits"
import { estimateCostUsd, needsPrice, stepCostUsd } from "@/features/secretary-agent/cost"
import { resolveOwnerReply } from "@/features/secretary-agent/owner-reply"
import { listOfChannel, memoryChannelOf } from "@/features/ai/agents"
import { DEFAULT_SECRETARY_SETTINGS, secretarySettingsSchema } from "@/features/secretary-agent/schemas"

describe("conversationIdOfJid", () => {
    it("deriva o id de contato, grupo e lid e volta ao JID", () => {
        expect(conversationIdOfJid("5531999999999:12@s.whatsapp.net")).toBe("5531999999999")
        expect(conversationIdOfJid("120363000000000001@g.us")).toBe("g-120363000000000001")
        expect(conversationIdOfJid("553199999999-1600000000@g.us")).toBe("g-553199999999-1600000000")
        expect(conversationIdOfJid("123456789012345@lid")).toBe("lid-123456789012345")
        expect(jidOfConversationId("g-120363000000000001")).toBe("120363000000000001@g.us")
        expect(jidOfConversationId("5531999999999")).toBe("5531999999999@s.whatsapp.net")
    })

    it("recusa JIDs que não são conversa", () => {
        expect(conversationIdOfJid("status@broadcast")).toBeNull()
        expect(conversationIdOfJid("abc@s.whatsapp.net")).toBeNull()
        expect(jidOfConversationId("../x")).toBeNull()
    })

    it("o canal da conversa vai e volta pelo id", () => {
        const ns = { app: "opex", prefixed: false }
        const channel = memoryChannelOf("secretary-conversation", { conversationId: "g-120363000000000001" }, ns)
        expect(channel).toBe("agentes/secretario/conversas/g-120363000000000001")
        expect(listOfChannel(channel, ns)).toEqual({ agentId: "secretary-conversation", conversationId: "g-120363000000000001" })
    })
})

describe("splitMessages", () => {
    it("separa por linha em branco e respeita o máximo de partes", () => {
        expect(splitMessages("oi\n\ntudo bem?\n\nbora", { enabled: true })).toEqual(["oi", "tudo bem?", "bora"])
        expect(splitMessages("a\n\nb\n\nc", { enabled: true, maxParts: 2 })).toEqual(["a", "b\n\nc"])
        expect(splitMessages("a\n\nb", { enabled: false })).toEqual(["a\n\nb"])
        expect(splitMessages("   ", { enabled: true })).toEqual([])
    })

    it("atraso aleatório fica dentro da faixa", () => {
        expect(randomDelayMs(3, 10, () => 0)).toBe(3000)
        expect(randomDelayMs(3, 10, () => 1)).toBe(10000)
    })
})

describe("limites e custo", () => {
    const now = new Date("2026-11-25T14:30:00Z")
    it("orçamento diário tem prioridade e a chave da janela é o dia de São Paulo", () => {
        const result = checkLimits({ now, repliesLastHour: 50, repliesPerHour: 20, spentTodayUsd: 2, dailyBudgetUsd: 2, conversationId: "5531" })
        expect(result).toMatchObject({ blocked: true, kind: "budget", windowKey: "budget:2026-11-25" })
    })

    it("limite por conversa usa a hora como janela (o aviso sai uma vez por janela)", () => {
        const a = checkLimits({ now, repliesLastHour: 20, repliesPerHour: 20, spentTodayUsd: 0, dailyBudgetUsd: 2, conversationId: "5531" })
        const b = checkLimits({ now: new Date(now.getTime() + 10 * 60_000), repliesLastHour: 20, repliesPerHour: 20, spentTodayUsd: 0, dailyBudgetUsd: 2, conversationId: "5531" })
        const next = checkLimits({ now: new Date(now.getTime() + 60 * 60_000), repliesLastHour: 20, repliesPerHour: 20, spentTodayUsd: 0, dailyBudgetUsd: 2, conversationId: "5531" })
        expect(a.windowKey).toBe(b.windowKey)
        expect(next.windowKey).not.toBe(a.windowKey)
        expect(checkLimits({ now, repliesLastHour: 3, repliesPerHour: 20, spentTodayUsd: 0, dailyBudgetUsd: 2, conversationId: "5531" }).blocked).toBe(false)
    })

    it("início do dia em São Paulo", () => {
        expect(startOfDayIn(new Date("2026-11-25T02:00:00Z")).toISOString()).toBe("2026-11-24T03:00:00.000Z")
        expect(dayKey(new Date("2026-11-25T02:00:00Z"))).toBe("2026-11-24")
    })

    it("estima pela tabela quando o provedor não informa custo", () => {
        expect(estimateCostUsd({ inputTokens: 1_000_000, outputTokens: 500_000 }, { inputPerMTok: 1, outputPerMTok: 4 })).toBe(3)
        expect(stepCostUsd(0.5, { inputTokens: 1, outputTokens: 1 }, null)).toEqual({ costUsd: 0.5, estimated: false })
        expect(stepCostUsd(null, { inputTokens: 1_000_000, outputTokens: 0 }, { inputPerMTok: 2, outputPerMTok: 0 })).toEqual({ costUsd: 2, estimated: true })
        expect(needsPrice("opencode-go")).toBe(false)
        expect(needsPrice("anthropic")).toBe(true)
    })

    it("ligar com provedor sem custo exige o preço do modelo", () => {
        const base = { ...DEFAULT_SECRETARY_SETTINGS, enabled: true, instance: "opex", main: { ...DEFAULT_SECRETARY_SETTINGS.main, provider: "anthropic" as const, model: "claude" } }
        expect(secretarySettingsSchema.safeParse(base).success).toBe(false)
        expect(secretarySettingsSchema.safeParse({ ...base, pricing: { "anthropic/claude": { inputPerMTok: 3, outputPerMTok: 15 } } }).success).toBe(true)
    })
})

describe("resolveOwnerReply", () => {
    const pending = [
        { id: "q1", sentMessageId: "m1" },
        { id: "q2", sentMessageId: "m2" },
    ]
    it("resposta citada vale para a pergunta citada", () => {
        expect(resolveOwnerReply({ quotedId: "m2", text: "sim" }, pending)).toEqual({ kind: "answer", questionId: "q2" })
    })
    it("sem citação e uma só pendente, vale para ela", () => {
        expect(resolveOwnerReply({ quotedId: null, text: "sim" }, [pending[0]!])).toEqual({ kind: "answer", questionId: "q1" })
    })
    it("sem citação e várias pendentes, pede para citar", () => {
        expect(resolveOwnerReply({ quotedId: null, text: "sim" }, pending)).toEqual({ kind: "ask-quote", pending: 2 })
    })
    it("sem pendentes, ignora", () => {
        expect(resolveOwnerReply({ quotedId: null, text: "nota pessoal" }, [])).toEqual({ kind: "none", reason: "no-pending" })
    })
})
