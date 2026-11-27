import { randomUUID } from "node:crypto"
import { setTimeout as sleep } from "node:timers/promises"
import { normalizeJid } from "@/features/evolution-api/constants"
import type { ParsedMessage } from "@/features/evolution-api/message"
import { EvolutionInstanceState } from "@/features/evolution-api/server/models"
import { publishAppEvent } from "@/lib/pusher/channels"
import { FROM_ME_SETTLE_MS, OWNER_TAKEOVER_REASON, SECRETARY_CONVERSATION_EVENT, SECRETARY_DECISION_EVENT, isStaleMessage, type SecretaryDecision } from "../constants"
import { conversationIdOfJid } from "../conversation-id"
import { SecretaryConversation, SecretaryDecisionRecord, SecretarySent, secretaryDb } from "./models"
import { loadSecretarySettings } from "./settings"
import { runSecretaryTurn } from "./turn"
import { handleOwnerReply } from "./owner-questions"

/**
 * `costUsd`: custo de IA do turno que tomou a decisão (vai para as execuções das métricas); ausente quando não houve turno.
 * `messageIds`: mensagens que o turno enviou (selo "Secretário" na aba Conversas, OPE-197).
 */
export async function recordDecision(instance: string, chatId: string, message: ParsedMessage, decision: SecretaryDecision, reason: string, topic: string | null = null, resumed = false, costUsd?: number, messageIds?: string[]) {
    await SecretaryDecisionRecord.updateOne({ _id: `${instance}:${message.id}${resumed ? ":resume" : ""}` }, { $set: { instance, chatId, jid: message.chatJid, decision, reason, topic, at: new Date(), ...(costUsd === undefined ? {} : { costUsd }), ...(messageIds?.length ? { messageIds } : {}) } }, { upsert: true })
    await publishAppEvent(SECRETARY_DECISION_EVENT, { chatId })
}

export async function handleIncomingMessage(instance: string, message: ParsedMessage) {
    const chatId = conversationIdOfJid(message.chatJid)
    if (!chatId || message.ignorable) return
    await secretaryDb()
    const { settings } = await loadSecretarySettings()
    if (settings.instance !== instance) return
    const owner = await EvolutionInstanceState.findById(instance).select("ownerJid ownerLid").lean()
    const ownerJid = owner?.ownerJid
    const ownerLid = owner?.ownerLid ?? null
    if (!ownerJid) {
        if (!message.fromMe) await recordDecision(instance, chatId, message, "error", "Não foi possível identificar o perfil conectado.")
        return
    }
    const id = `${instance}:${chatId}`
    if (message.fromMe) {
        await sleep(FROM_ME_SETTLE_MS)
        if (await SecretarySent.exists({ _id: `${instance}:${message.id}` })) return
        if (message.chatJid === normalizeJid(ownerJid)) {
            if (isStaleMessage(message.timestamp)) {
                await recordDecision(instance, chatId, message, "ignored", "Mensagem antiga: não resolve uma pergunta pendente.")
                return
            }
            if (settings.enabled) await handleOwnerReply(instance, ownerJid, message)
            return
        }
        // A pausa conta da hora da mensagem do dono (uma antiga, entregue depois de uma reconexão, não pausa de novo).
        const sentAt = message.timestamp.getTime() > Date.now() ? new Date() : message.timestamp
        const pausedUntil = new Date(sentAt.getTime() + settings.pauseMinutes * 60_000)
        if (pausedUntil.getTime() <= Date.now()) {
            await recordDecision(instance, chatId, message, "ignored", "Mensagem antiga do dono (entregue depois de uma reconexão): a pausa já teria acabado.")
            return
        }
        await SecretaryConversation.updateOne({ _id: id }, { $setOnInsert: { instance, jid: message.chatJid },
            $max: { lastOwnerMessageAt: sentAt, pausedUntil } }, { upsert: true })
        await recordDecision(instance, chatId, message, "paused", OWNER_TAKEOVER_REASON)
        await publishAppEvent(SECRETARY_CONVERSATION_EVENT, { chatId })
        return
    }
    if (message.chatJid === normalizeJid(ownerJid)) return
    if (isStaleMessage(message.timestamp)) {
        await recordDecision(instance, chatId, message, "ignored", "Mensagem antiga (entregue depois de uma reconexão): não é respondida.")
        return
    }
    if (!settings.enabled || !settings.main.provider || !settings.main.model) {
        await recordDecision(instance, chatId, message, "disabled", "Agente desligado ou sem modelo configurado.")
        return
    }
    const token = randomUUID()
    await SecretaryConversation.updateOne({ _id: id }, { $set: { token }, $setOnInsert: { instance, jid: message.chatJid }, $push: { pending: message } }, { upsert: true, setDefaultsOnInsert: false })
    await sleep(settings.human.groupingSeconds * 1000)
    // Migração dos nomes dos canais de memória (OPE-206): a resposta automática espera a retomada.
    await (await import("@/features/engramind/server/instance")).waitForMemoryMaintenance()
    await runSecretaryTurn({ id, instance, chatId, ownerJid, ownerLid, token, message })
}
