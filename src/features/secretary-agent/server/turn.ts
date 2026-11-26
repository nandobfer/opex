import { setTimeout as sleep } from "node:timers/promises"
import type { ToolSet } from "ai"
import { getLocalUser } from "@/lib/local-user"
import { agentMemoryContext } from "@/features/ai/server/agent-memory-context"
import { selfMemoryEnabled } from "@/features/ai/server/self-memory/settings"
import { selfMemoryTools } from "@/features/ai/server/self-memory/tools"
import { evolution } from "@/features/evolution-api/server/client"
import { mentionsOwner, messageDisplayText, parseEvolutionMessage, type ParsedMessage } from "@/features/evolution-api/message"
import { evaluateAudience } from "../criteria"
import { checkLimits, lastHourSince } from "../limits"
import { SECRETARY_CONSUMPTION_ORIGIN, SECRETARY_DECISION_CONSUMPTION_ORIGIN, SECRETARY_HISTORY_LIMIT, PAUSED_MESSAGE_REASON, type SecretaryDecision } from "../constants"
import { randomDelayMs, typingMs } from "../split"
import { spentTodayUsd } from "./budget"
import { recordDecision } from "./inbound"
import { SecretaryConversation, SecretaryDecisionRecord, SecretaryNotice } from "./models"
import { askOwner, publishNotices, sendSecretaryText } from "./owner-questions"
import { loadPersonality } from "./personality"
import { planSecretaryReply } from "./plan-reply"
import { costBySubject } from "./run-cost"
import { resolveSecretaryContact } from "./contact"
import { loadSecretarySettings } from "./settings"
import { readTurnMedia } from "./media"
import { pendingOpOfTool, withPendingQueue } from "./memory-queue"
import type { AiAgentId } from "@/features/ai/agents"
import { errorKind, safeErr, secretaryLog } from "./log"
import { SecretaryProviderError } from "../ai-errors"

/**
 * Ferramentas de memória do turno real (sem `forget_my_memory`), com a fila de pendências quando o Engramind está fora
 * do ar e a conferência de que a conversa ainda é a mesma antes de gravar.
 */
async function memoryToolSet(input: { chatId: string; token: string; write: Promise<boolean>; stillCurrent: () => Promise<boolean> }): Promise<ToolSet> {
    const sdk = await import("ai")
    const turn = { kind: "conversation" as const, conversationId: input.chatId }
    const memoryTools = selfMemoryTools({ consumer: "secretario", turn, turnKey: input.token, actorId: getLocalUser().id, label: "Agente Secretário" }, undefined, { write: await input.write })
    return Object.fromEntries(memoryTools.filter((item) => item.name !== "forget_my_memory").map((item) => [item.name, sdk.dynamicTool({ description: item.description, inputSchema: item.modelInputSchema ?? item.input,
        execute: async (raw) => {
            if (!await input.stillCurrent()) return { error: "A conversa mudou." }
            const parsed = item.input.parse(raw) as Record<string, unknown>
            const list = (typeof parsed.lista === "string" ? parsed.lista : "secretary-global") as AiAgentId
            return withPendingQueue({ list, conversationId: input.chatId, actorId: getLocalUser().id, write: pendingOpOfTool(item.name, parsed) }, () => item.execute(parsed, { actorId: getLocalUser().id, sessionId: "" }))
        },
    })]))
}

interface Turn { id: string; instance: string; chatId: string; ownerJid: string; ownerLid?: string | null; token: string; message: ParsedMessage; ownerAnswer?: string }

export async function runSecretaryTurn({ id, instance, chatId, ownerJid, ownerLid = null, token, message, ownerAnswer }: Turn) {
    // As chamadas de IA do turno (mídia, decisão do assunto e resposta) são gravadas com o token como assunto: a decisão
    // leva a soma, que vira o custo da execução nas métricas.
    const decide = async (decision: SecretaryDecision, reason: string, topic?: string | null) =>
        recordDecision(instance, chatId, message, decision, reason, topic, ownerAnswer !== undefined, await costBySubject(token).catch(() => undefined))
    const state = await SecretaryConversation.findOneAndUpdate({ _id: id, token }, { $set: { pending: [] } }).lean()
    if (!state) {
        await decide("grouped", "Outra mensagem chegou na janela de agrupamento.")
        return
    }
    const messages = (state.pending?.length ? state.pending : [message]).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
    const ownerRevision = state.lastOwnerMessageAt ?? null
    const current = async () => Boolean(await SecretaryConversation.exists({ _id: id, token, lastOwnerMessageAt: ownerRevision,
        $or: [{ pausedUntil: null }, { pausedUntil: { $lte: new Date() } }] }))
    try {
        const { settings } = await loadSecretarySettings()
        if (!settings.enabled || !settings.main.provider || !settings.main.model || settings.instance !== instance) return await decide("disabled", "Agente desligado ou instância alterada.")
        // Etapa 1 dos critérios antes de qualquer custo: quem não pode ser respondido não tem a mídia baixada nem lida.
        const mentioned = messages.some((item) => mentionsOwner(item, ownerJid, ownerLid))
        const audience = evaluateAudience(settings.criteria, { jid: message.chatJid, isGroup: message.isGroup, mentioned })
        if (audience.failure) return await decide("ignored", audience.failure.reason)
        if (state.pausedUntil && state.pausedUntil > new Date()) return await decide("paused", PAUSED_MESSAGE_REASON)
        const now = new Date()
        const [repliesLastHour, spent] = await Promise.all([
            SecretaryDecisionRecord.countDocuments({ instance, chatId, at: { $gte: lastHourSince(now) }, decision: { $in: ["replied", "asked-owner"] } }),
            spentTodayUsd(now),
        ])
        const limit = checkLimits({ ...settings.limits, now, repliesLastHour, spentTodayUsd: spent, conversationId: chatId })
        // Um orçamento esgotado impede novas chamadas de IA, inclusive classificação/transcrição.
        if (limit.blocked && (limit.kind === "budget" || settings.mode === "reply")) {
            if (settings.mode === "reply" && await current()) {
                const notice = await SecretaryNotice.updateOne({ _id: limit.windowKey! }, { $setOnInsert: { instance, chatId, jid: message.chatJid, kind: limit.kind, status: "info", text: limit.reason, at: now } }, { upsert: true })
                if (notice.upsertedCount) { await publishNotices(); await sendSecretaryText(instance, ownerJid, limit.reason!) }
            }
            return await decide("limit-reached", limit.reason!)
        }
        const media = await Promise.all(messages.map((item) => readTurnMedia(settings, instance, item, token)))
        if (!messages.some((item, index) => item.text || media[index]?.understood) && !ownerAnswer) return await decide("ignored", "A mensagem não tem texto ou mídia interpretável.")
        const text = media.map((item) => item.text).filter(Boolean).join("\n")
        const observing = settings.mode === "observe"
        const turn = { kind: "conversation" as const, conversationId: chatId }
        const pendingIds = new Set(messages.map((item) => item.id))
        let historyCache: Promise<{ owner: boolean; text: string }[]> | null = null
        const writeMemory = selfMemoryEnabled("secretario")
        const plan = await planSecretaryReply({
            settings, chatJid: message.chatJid, isGroup: message.isGroup, mentioned,
            text, ownerAnswer, id: token, subject: token, origins: { reply: SECRETARY_CONSUMPTION_ORIGIN, decision: SECRETARY_DECISION_CONSUMPTION_ORIGIN }, observing,
        }, {
            history: () => (historyCache ??= evolution.findMessages(instance, { remoteJid: message.chatJid, pageSize: SECRETARY_HISTORY_LIMIT })
                .then((page) => page.records.filter((item) => !pendingIds.has(item.key.id)).reverse().map((item) => ({ owner: item.key.fromMe, text: messageDisplayText(parseEvolutionMessage(item)) })))),
            contact: () => resolveSecretaryContact({ jid: message.chatJid, participant: message.participant, pushName: message.pushName, instance }),
            memory: (focus) => agentMemoryContext("secretario", turn, { focus }),
            personality: async () => (await loadPersonality()).snapshot,
            stillCurrent: current,
            tools: () => memoryToolSet({ chatId, token, write: writeMemory, stillCurrent: current }),
        })
        const topic = plan.subject?.decision.topic ?? null
        if (plan.kind === "skip") return await decide(plan.verdict.rule === "subject-blocked" || plan.verdict.rule === "subject-not-allowed" ? "subject-blocked" : "ignored", plan.verdict.reason, topic)
        if (plan.kind === "discarded") return await decide("discarded", "A conversa mudou antes de preparar a resposta.", topic)
        const verdict = plan.verdict
        const subject = { topic }
        const result = { question: plan.question }
        if (observing) return await decide("observe-only", "Modo Só observar.", subject.topic)
        const parts = plan.parts
        // Só a pergunta, sem frase de espera: a dúvida ainda chega ao dono (sem enviar nada ao contato).
        if (!parts.length && result.question && !ownerAnswer && await current()) {
            await askOwner({ instance, ownerJid, chatId, message, text, question: result.question, ownerRevision })
            return await decide("asked-owner", "Perguntou ao dono sem enviar frase de espera.", subject.topic)
        }
        if (!parts.length) return await decide("ignored", "Nenhuma resposta foi produzida.", subject.topic)
        await sleep(randomDelayMs(settings.human.delayMinSeconds, settings.human.delayMaxSeconds))
        let sent = 0
        for (const part of parts) {
            if (!await current()) break
            if (settings.human.typing) await evolution.sendPresence(instance, { number: message.chatJid, presence: "composing", delay: typingMs(part) })
            if (!await current()) break
            await sendSecretaryText(instance, message.chatJid, part)
            if (++sent === 1 && settings.human.markRead) {
                await evolution.markAsRead(instance, messages.map((item) => ({ id: item.id, remoteJid: item.chatJid, fromMe: false })))
            }
        }
        if (!sent) return await decide("discarded", "A conversa mudou antes do envio.", subject.topic)
        if (result.question && !ownerAnswer && await current()) {
            await askOwner({ instance, ownerJid, chatId, message, text, question: result.question, ownerRevision })
            return await decide("asked-owner", "Enviou uma frase de espera e perguntou ao dono.", subject.topic)
        }
        await decide("replied", verdict.reason, subject.topic)
    } catch (error) {
        const providerFailure = error instanceof SecretaryProviderError
        const reason = providerFailure ? error.message : `O turno falhou (${errorKind(error)}). Confira a conexão Evolution e o provedor.`
        secretaryLog.error({ ...safeErr(providerFailure ? error.cause : error), reason, instance, chatId }, "[secretario] Falha no turno")
        await decide("error", `${reason} Nenhum envio será repetido automaticamente.`)
    } finally {
        await SecretaryConversation.updateOne({ _id: id, token }, { $set: { token: null } })
    }
}
