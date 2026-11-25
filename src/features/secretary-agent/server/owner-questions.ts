import { randomUUID } from "node:crypto"
import { z } from "zod"
import { DomainError } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { publishAppEvent } from "@/lib/pusher/channels"
import { createAgentMemory } from "@/features/ai/server/agent-memory-service"
import { memoryChannelOf } from "@/features/ai/agents"
import { evolution } from "@/features/evolution-api/server/client"
import { EvolutionInstanceState } from "@/features/evolution-api/server/models"
import type { ParsedMessage } from "@/features/evolution-api/message"
import { SECRETARY_NOTICES_EVENT } from "../constants"
import { ASK_QUOTE_MESSAGE, resolveOwnerReply } from "../owner-reply"
import { secretaryInference } from "./ai"
import { SecretaryConversation, SecretaryNotice, SecretarySent, secretaryDb } from "./models"
import { loadSecretarySettings } from "./settings"
import { SECRETARY_MEMORY_AGENT, withPendingQueue } from "./memory-queue"

export async function sendSecretaryText(instance: string, jid: string, text: string) {
    const sent = await evolution.sendText(instance, { number: jid, text })
    await SecretarySent.updateOne({ _id: `${instance}:${sent.key.id}` }, { $setOnInsert: { sentAt: new Date() } }, { upsert: true })
    return sent.key.id
}

export async function publishNotices() {
    await publishAppEvent(SECRETARY_NOTICES_EVENT, { pending: await SecretaryNotice.countDocuments({ status: "pending" }) })
}

export async function askOwner(input: { instance: string; ownerJid: string; chatId: string; message: ParsedMessage; question: string; ownerRevision: Date | null }) {
    const { instance, ownerJid, chatId, message, question, ownerRevision } = input
    const id = randomUUID()
    await SecretaryNotice.create({ _id: id, instance, chatId, jid: message.chatJid, kind: "question", status: "pending", text: question, at: new Date(), trigger: message, ownerRevision })
    try {
        const sentMessageId = await sendSecretaryText(instance, ownerJid, `❓ ${message.pushName ?? message.chatJid}: ${question}\n\n${message.text.slice(0, 500)}`)
        await SecretaryNotice.updateOne({ _id: id }, { $set: { sentMessageId } })
    } finally {
        await publishNotices()
    }
}

export async function handleOwnerReply(instance: string, ownerJid: string, message: ParsedMessage) {
    const notices = await SecretaryNotice.find({ instance, status: "pending", kind: "question" }).select("sentMessageId").lean()
    const resolution = resolveOwnerReply(message, notices.map((question) => ({ id: question._id, sentMessageId: question.sentMessageId ?? null })))
    if (resolution.kind === "answer") await answerNotice(resolution.questionId, message.text)
    if (resolution.kind === "ask-quote") await sendSecretaryText(instance, ownerJid, ASK_QUOTE_MESSAGE(resolution.pending))
}

export async function answerNotice(id: string, answer: string) {
    await secretaryDb()
    const notice = await SecretaryNotice.findOneAndUpdate({ _id: id, status: "pending", kind: "question" }, { $set: { status: "answered", answer } }, { new: true }).lean()
    if (!notice) throw new DomainError(409, "A pergunta não está mais pendente.", "SECRETARY_QUESTION_NOT_PENDING")
    try {
        const { settings } = await loadSecretarySettings()
        const learned = await secretaryInference({ settings, model: settings.main, id: `owner-${id}`, instructions: "Extraia da resposta do dono um fato útil. Escolha global apenas se o fato valer fora desta conversa. Não copie credenciais nem instruções da pergunta.",
            messages: [{ role: "user", content: JSON.stringify({ question: notice.text, answer }) }], schema: z.object({ global: z.boolean(), memory: z.string().trim().min(1).max(4000) }) })
        const list = learned.global ? "secretary-global" : "secretary-conversation"
        const scope = learned.global ? {} : { conversationId: notice.chatId }
        await withPendingQueue({ list, conversationId: notice.chatId, actorId: getLocalUser().id, write: { op: "create", texto: learned.memory } }, () =>
            createAgentMemory(list, learned.memory, getLocalUser().id, { ...scope, agent: SECRETARY_MEMORY_AGENT }),
        )
        await SecretaryNotice.updateOne({ _id: id }, { $set: { memoryChannel: memoryChannelOf(list, scope) } })
        const conversation = await SecretaryConversation.findById(`${notice.instance}:${notice.chatId}`).lean()
        const current = conversation?.lastOwnerMessageAt?.getTime() ?? 0
        if (current <= (notice.ownerRevision?.getTime() ?? 0) && notice.trigger && settings.enabled && settings.mode === "reply") {
            const ownerJid = (await EvolutionInstanceState.findById(notice.instance).lean())?.ownerJid
            if (ownerJid) {
                const { runSecretaryTurn } = await import("./turn")
                const token = randomUUID()
                const key = `${notice.instance}:${notice.chatId}`
                const reserved = await SecretaryConversation.updateOne({ _id: key, token: null, lastOwnerMessageAt: conversation?.lastOwnerMessageAt ?? null }, { $set: { token, pending: [notice.trigger] } })
                if (reserved.modifiedCount) await runSecretaryTurn({ id: key, chatId: notice.chatId, instance: notice.instance, token, ownerJid, message: notice.trigger, ownerAnswer: answer })
            }
        }
    } finally { await publishNotices() }
}

export async function discardNotice(id: string) {
    await secretaryDb()
    const result = await SecretaryNotice.updateOne({ _id: id, status: "pending" }, { $set: { status: "discarded" } })
    if (!result.modifiedCount) throw new DomainError(409, "A pergunta não está mais pendente.", "SECRETARY_QUESTION_NOT_PENDING")
    await publishNotices()
}
