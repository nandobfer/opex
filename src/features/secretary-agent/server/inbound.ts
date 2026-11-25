import { randomUUID } from "node:crypto"
import { setTimeout as sleep } from "node:timers/promises"
import { normalizeJid } from "@/features/evolution-api/constants"
import type { ParsedMessage } from "@/features/evolution-api/message"
import { EvolutionInstanceState } from "@/features/evolution-api/server/models"
import { publishAppEvent } from "@/lib/pusher/channels"
import { FROM_ME_SETTLE_MS, SECRETARY_CONVERSATION_EVENT, SECRETARY_DECISION_EVENT, type SecretaryDecision } from "../constants"
import { conversationIdOfJid } from "../conversation-id"
import { SecretaryConversation, SecretaryDecisionRecord, SecretarySent, secretaryDb } from "./models"
import { loadSecretarySettings } from "./settings"
import { runSecretaryTurn } from "./turn"
import { handleOwnerReply } from "./owner-questions"

export async function recordDecision(instance: string, chatId: string, message: ParsedMessage, decision: SecretaryDecision, reason: string, topic: string | null = null) {
    await SecretaryDecisionRecord.updateOne({ _id: `${instance}:${message.id}` }, { $set: { instance, chatId, jid: message.chatJid, decision, reason, topic, at: new Date() } }, { upsert: true })
    await publishAppEvent(SECRETARY_DECISION_EVENT, { chatId })
}

export async function handleIncomingMessage(instance: string, message: ParsedMessage) {
    const chatId = conversationIdOfJid(message.chatJid)
    if (!chatId || message.ignorable) return
    await secretaryDb()
    const { settings } = await loadSecretarySettings()
    if (settings.instance !== instance) return
    const ownerJid = (await EvolutionInstanceState.findById(instance).select("ownerJid").lean())?.ownerJid
    if (!ownerJid) {
        if (!message.fromMe) await recordDecision(instance, chatId, message, "error", "Não foi possível identificar o perfil conectado.")
        return
    }
    const id = `${instance}:${chatId}`
    if (message.fromMe) {
        await sleep(FROM_ME_SETTLE_MS)
        if (await SecretarySent.exists({ _id: `${instance}:${message.id}` })) return
        if (message.chatJid === normalizeJid(ownerJid)) {
            if (settings.enabled) await handleOwnerReply(instance, ownerJid, message)
            return
        }
        await SecretaryConversation.updateOne({ _id: id }, { $setOnInsert: { instance, jid: message.chatJid },
            $max: { lastOwnerMessageAt: new Date(), pausedUntil: new Date(Date.now() + settings.pauseMinutes * 60_000) } }, { upsert: true })
        await recordDecision(instance, chatId, message, "paused", "O dono assumiu a conversa pelo WhatsApp.")
        await publishAppEvent(SECRETARY_CONVERSATION_EVENT, { chatId })
        return
    }
    if (message.chatJid === normalizeJid(ownerJid)) return
    if (!settings.enabled || !settings.main.provider || !settings.main.model) {
        await recordDecision(instance, chatId, message, "disabled", "Agente desligado ou sem modelo configurado.")
        return
    }
    const token = randomUUID()
    await SecretaryConversation.updateOne({ _id: id }, { $set: { token }, $setOnInsert: { instance, jid: message.chatJid }, $push: { pending: message } }, { upsert: true, setDefaultsOnInsert: false })
    await sleep(settings.human.groupingSeconds * 1000)
    await runSecretaryTurn({ id, instance, chatId, ownerJid, token, message })
}
