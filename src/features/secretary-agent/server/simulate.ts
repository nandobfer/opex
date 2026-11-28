import { randomUUID } from "node:crypto"
import { z } from "zod"
import { DomainError } from "@/lib/api/route"
import { agentMemoryContext } from "@/features/ai/server/agent-memory-context"
import { isGroupJid } from "@/features/evolution-api/constants"
import { messageDisplayText, parseEvolutionMessage } from "@/features/evolution-api/message"
import { recentConversationMessages } from "@/features/evolution-api/server/chat"
import { SECRETARY_HISTORY_LIMIT, SECRETARY_SIMULATION_CONSUMPTION_ORIGIN } from "../constants"
import { conversationIdOfJid } from "../conversation-id"
import type { CriteriaStep, CriteriaVerdict } from "../criteria"
import { checkLimits, lastHourSince } from "../limits"
import type { SecretarySettings, SimulateInput } from "../schemas"
import { spentTodayUsd } from "./budget"
import type { SubjectTrace } from "./decide-subject"
import { SecretaryConversation, SecretaryDecisionRecord, secretaryDb } from "./models"
import { loadPersonality } from "./personality"
import { planSecretaryReply } from "./plan-reply"
import { costBySubject } from "./run-cost"
import { resolveSecretaryContact } from "./contact"
import type { SecretaryContact } from "../contact"

/**
 * Simulação (aba Simulação, plano v3 da OPE-192): o MESMO núcleo do turno real (`planSecretaryReply`) com as
 * configurações em edição, sem enviar, marcar como lida, gravar decisão ou gravar memória no Engramind. O que o
 * Secretário gravaria volta no rastro (e fica só no navegador). O custo é real e fica fora do orçamento diário.
 */

export interface SimulateResult {
    replies: string[]
    decision: Pick<CriteriaVerdict, "decision" | "rule" | "reason"> & { label: string }
    steps: CriteriaStep[]
    subject: SubjectTrace | null
    /** Informativo: o turno real seria barrado por limite, orçamento ou pausa (a simulação não aplica). */
    limits: { repliesLastHour: number; repliesPerHour: number; spentTodayUsd: number; dailyBudgetUsd: number; blockedReason: string | null } | null
    pausedUntil: string | null
    personality: { variant: string | null }
    memories: { counts: { full: number; titles: number; overflow: number } | null; written: { channel: string; title: string; text: string }[] }
    question: string | null
    /** O que o agente recebeu sobre o contato (nome, número e, em grupo, o autor). */
    contact: SecretaryContact | null
    observing: boolean
    costUsd: number
}

const rememberInput = z.object({ lista: z.enum(["secretary-global", "secretary-conversation"]).default("secretary-global"), texto: z.string().trim().min(1).max(4000) })
const CHANNEL_LABEL = { "secretary-global": "Global do Secretário", "secretary-conversation": "Desta conversa" } as const

async function realHistory(settings: SecretarySettings, jid: string) {
    if (!settings.instance) throw new DomainError(409, "Escolha a instância do WhatsApp na aba Geral para continuar a conversa real.", "SECRETARY_INSTANCE_REQUIRED")
    const records = await recentConversationMessages(settings.instance, jid, SECRETARY_HISTORY_LIMIT)
    return records.reverse().map((item) => ({ owner: item.key.fromMe, text: messageDisplayText(parseEvolutionMessage(item)) }))
}

async function realState(settings: SecretarySettings, chatId: string | null) {
    if (!settings.instance || !chatId) return { limits: null, pausedUntil: null }
    await secretaryDb()
    const now = new Date()
    const [repliesLastHour, spent, conversation] = await Promise.all([
        SecretaryDecisionRecord.countDocuments({ instance: settings.instance, chatId, at: { $gte: lastHourSince(now) }, decision: { $in: ["replied", "asked-owner"] } }),
        spentTodayUsd(now),
        SecretaryConversation.findById(`${settings.instance}:${chatId}`).select("pausedUntil").lean(),
    ])
    const limit = checkLimits({ ...settings.limits, now, repliesLastHour, spentTodayUsd: spent, conversationId: chatId })
    const paused = conversation?.pausedUntil && conversation.pausedUntil > now ? conversation.pausedUntil.toISOString() : null
    return { limits: { repliesLastHour, repliesPerHour: settings.limits.repliesPerHour, spentTodayUsd: spent, dailyBudgetUsd: settings.limits.dailyBudgetUsd, blockedReason: limit.blocked ? limit.reason ?? null : null }, pausedUntil: paused }
}

export async function simulateSecretary(input: SimulateInput): Promise<SimulateResult> {
    const settings = input.settings as SecretarySettings
    if (!settings.main.provider || !settings.main.model) throw new DomainError(400, "Escolha o provedor e o modelo do agente na aba Geral para simular.", "SECRETARY_MODEL_REQUIRED")
    const simId = `sim-${randomUUID()}`
    const chatId = conversationIdOfJid(input.jid)
    const written: SimulateResult["memories"]["written"] = []
    let counts: SimulateResult["memories"]["counts"] = null
    let contact: SecretaryContact | null = null
    const history = input.useRealHistory ? [...(await realHistory(settings, input.jid)), ...input.history] : input.history
    const observing = settings.mode === "observe"
    const [plan, state] = await Promise.all([
        planSecretaryReply({
            settings, chatJid: input.jid, isGroup: isGroupJid(input.jid), mentioned: input.mentionsOwner, text: input.message, id: simId, subject: simId, observing,
            origins: { reply: SECRETARY_SIMULATION_CONSUMPTION_ORIGIN, decision: SECRETARY_SIMULATION_CONSUMPTION_ORIGIN },
        }, {
            history: async () => history,
            contact: async () => (contact = await resolveSecretaryContact({ jid: input.jid, author: "Participante do grupo", instance: settings.instance })),
            memory: async (focus) => {
                const memory = await agentMemoryContext("secretario", chatId ? { kind: "conversation", conversationId: chatId } : { kind: "review" }, { focus })
                const simulated = input.memories.map((item) => `- (${item.channel}) ${item.text}`).join("\n")
                counts = memory.counts
                return { block: simulated ? `${memory.block}\n\nGravadas nesta simulação:\n${simulated}` : memory.block, counts: memory.counts }
            },
            personality: async () => (await loadPersonality()).snapshot,
            stillCurrent: async () => true,
            tools: async () => {
                const { dynamicTool } = await import("ai")
                return {
                    remember: dynamicTool({
                        description: "Grava um fato durável (na simulação, nada é gravado: o fato volta no rastro).",
                        inputSchema: rememberInput,
                        execute: async (raw) => {
                            const parsed = rememberInput.parse(raw)
                            written.push({ channel: CHANNEL_LABEL[parsed.lista], title: parsed.texto.slice(0, 80), text: parsed.texto })
                            return { ok: true, simulada: true }
                        },
                    }),
                }
            },
        }),
        realState(settings, chatId),
    ])
    const replies = plan.kind === "reply" && !observing ? plan.parts : []
    return {
        replies,
        decision: { decision: plan.verdict.decision, rule: plan.verdict.rule, reason: plan.verdict.reason, label: plan.kind === "reply" ? (observing ? "Só observaria" : replies.length ? "Responderia" : "Não produziria resposta") : "Não responderia" },
        steps: plan.verdict.steps,
        subject: plan.subject,
        limits: state.limits,
        pausedUntil: state.pausedUntil,
        personality: { variant: plan.kind === "reply" ? plan.variant : null },
        memories: { counts, written },
        question: plan.kind === "reply" ? plan.question : null,
        contact,
        observing,
        costUsd: await costBySubject(simId),
    }
}
