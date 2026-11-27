import { randomUUID } from "node:crypto"
import { z } from "zod"
import { DomainError } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { publishAppEvent } from "@/lib/pusher/channels"
import { createAgentMemory } from "@/features/ai/server/agent-memory-service"
import { memoryChannelOf } from "@/features/ai/agents"
import { evolution } from "@/features/evolution-api/server/client"
import { EvolutionInstanceState } from "@/features/evolution-api/server/models"
import { contactsByJid } from "@/features/evolution-api/server/contacts"
import type { ParsedMessage } from "@/features/evolution-api/message"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { runAfterResponse } from "@/lib/after-response"
import { SECRETARY_AUDIT_ENTITY, SECRETARY_NOTICES_EVENT } from "../constants"
import type { SecretarySettings } from "../schemas"
import { safeErr, secretaryLog } from "./log"
import { ASK_QUOTE_MESSAGE, resolveOwnerReply } from "../owner-reply"
import { markdownToWhatsApp, ownerQuestionMessage } from "../whatsapp-format"
import { secretaryInference } from "./ai"
import { SecretaryConversation, SecretaryNotice, SecretarySent, secretaryDb, type Notice } from "./models"
import { loadSecretarySettings } from "./settings"
import { SECRETARY_MEMORY_AGENT, withPendingQueue } from "./memory-queue"

export async function sendSecretaryText(instance: string, jid: string, text: string) {
    const sent = await evolution.sendText(instance, { number: jid, text })
    await SecretarySent.updateOne({ _id: `${instance}:${sent.key.id}` }, { $setOnInsert: { sentAt: new Date() } }, { upsert: true })
    return sent.key.id
}

/** Texto livre para o dono (conversa consigo mesmo): sai no formato do WhatsApp, nunca em Markdown (OPE-199). */
export async function sendOwnerText(instance: string, ownerJid: string, text: string) {
    return sendSecretaryText(instance, ownerJid, markdownToWhatsApp(text))
}

export async function publishNotices() {
    await publishAppEvent(SECRETARY_NOTICES_EVENT, { pending: await SecretaryNotice.countDocuments({ status: "pending" }) })
}

export async function askOwner(input: { instance: string; ownerJid: string; chatId: string; message: ParsedMessage; text: string; question: string; ownerRevision: Date | null }) {
    const { instance, ownerJid, chatId, message, text, question, ownerRevision } = input
    const id = randomUUID()
    const contacts = await contactsByJid([message.chatJid, ...(message.participant ? [message.participant] : [])], instance).catch((error: unknown) => {
        secretaryLog.warn(safeErr(error), "[secretario] Nome e foto indisponíveis no aviso; usando identificação da conversa")
        return null
    })
    const chatNumber = message.chatJid.split("@")[0]
    const contactName = contacts?.get(message.chatJid)?.name || (message.isGroup ? `Grupo ${chatNumber}` : message.pushName || chatNumber)
    const author = message.isGroup ? (message.participant ? contacts?.get(message.participant)?.name : null) || message.pushName || message.participant?.split("@")[0] || "Autor desconhecido" : undefined
    const excerpt = text.trim().slice(0, 500)
    await SecretaryNotice.create({ _id: id, instance, chatId, jid: message.chatJid, kind: "question", status: "pending", text: question, excerpt, author, contactName, at: new Date(), trigger: message, ownerRevision })
    try {
        const sentMessageId = await sendSecretaryText(instance, ownerJid, ownerQuestionMessage({ contactName, author, question, excerpt }))
        await SecretaryNotice.updateOne({ _id: id }, { $set: { sentMessageId } })
    } finally {
        await publishNotices()
    }
}

export async function handleOwnerReply(instance: string, ownerJid: string, message: ParsedMessage) {
    const notices = await SecretaryNotice.find({ instance, status: "pending", kind: "question" }).select("sentMessageId").lean()
    const resolution = resolveOwnerReply(message, notices.map((question) => ({ id: question._id, sentMessageId: question.sentMessageId ?? null })))
    if (resolution.kind === "answer") await answerNotice(resolution.questionId, message.text, getLocalUser().id)
    if (resolution.kind === "ask-quote") await sendOwnerText(instance, ownerJid, ASK_QUOTE_MESSAGE(resolution.pending))
}

/** Uma resposta em andamento sem conclusão há mais que isso (processo reiniciado) pode ser respondida de novo. */
export const ANSWERING_STALE_MS = 5 * 60_000

/** Pergunta que ainda aceita resposta ou descarte: pendente, ou com uma resposta presa (processo reiniciado no meio). */
function openQuestionFilter() {
    return [{ status: "pending" as const }, { status: "answering" as const, answeringAt: { $lt: new Date(Date.now() - ANSWERING_STALE_MS) } }]
}

/**
 * Resposta do dono: reserva a pergunta (`answering`), aprende e grava a memória e só então marca como
 * respondida. Se a inferência ou a gravação falharem, a pergunta volta para pendente (o dono pode responder de
 * novo). A retomada da conversa roda depois da resposta (`runAfterResponse`), fora da requisição.
 */
export async function answerNotice(id: string, answer: string, actorId: string) {
    await secretaryDb()
    const notice = await SecretaryNotice.findOneAndUpdate(
        { _id: id, kind: "question", $or: openQuestionFilter() },
        { $set: { status: "answering", answeringAt: new Date() } },
        { new: true },
    ).lean()
    if (!notice) throw new DomainError(409, "A pergunta não está mais pendente.", "SECRETARY_QUESTION_NOT_PENDING")
    await publishNotices()
    let memoryChannel: string | null
    let settings: Awaited<ReturnType<typeof loadSecretarySettings>>["settings"]
    try {
        settings = (await loadSecretarySettings()).settings
        const learned = await secretaryInference({ settings, model: settings.main, id: `owner-${id}`, instructions: "Extraia da resposta do dono um fato útil. Escolha global apenas se o fato valer fora desta conversa. Não copie credenciais nem instruções da pergunta.",
            messages: [{ role: "user", content: JSON.stringify({ question: notice.text, answer }) }], schema: z.object({ global: z.boolean(), memory: z.string().trim().min(1).max(4000) }) })
        const list = learned.global ? "secretary-global" : "secretary-conversation"
        const scope = learned.global ? {} : { conversationId: notice.chatId }
        await withPendingQueue({ list, conversationId: notice.chatId, actorId, write: { op: "create", texto: learned.memory } }, () =>
            createAgentMemory(list, learned.memory, actorId, { ...scope, agent: SECRETARY_MEMORY_AGENT }),
        )
        const { channelNamespaceOrLegacy } = await import("@/features/engramind/server/instance")
        memoryChannel = memoryChannelOf(list, scope, await channelNamespaceOrLegacy())
    } catch (error) {
        secretaryLog.error({ ...safeErr(error), noticeId: id, chatId: notice.chatId }, "[secretario] Falha ao aprender a resposta do dono: a pergunta volta para pendente")
        await SecretaryNotice.updateOne({ _id: id, status: "answering" }, { $set: { status: "pending", answeringAt: null } })
        await publishNotices()
        throw new DomainError(502, "Não foi possível aprender a resposta agora (modelo ou memórias indisponíveis). A pergunta continua pendente: responda de novo.", "SECRETARY_ANSWER_FAILED")
    }
    await SecretaryNotice.updateOne({ _id: id }, { $set: { status: "answered", answer, memoryChannel, answeringAt: null } })
    await recordAudit({ userId: actorId, entidade: SECRETARY_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.ATUALIZAR, depois: { acao: "responder pergunta", chatId: notice.chatId, memoryChannel } })
    await publishNotices()
    runAfterResponse("secretary-resume", () => resumeConversation(notice, answer, settings))
}

/** Retoma a conversa pendente com a resposta, a menos que o dono já a tenha assumido depois da pergunta. */
async function resumeConversation(notice: Notice, answer: string, settings: SecretarySettings) {
    try {
        if (!notice.trigger || !settings.enabled || settings.mode !== "reply") return
        const key = `${notice.instance}:${notice.chatId}`
        const conversation = await SecretaryConversation.findById(key).lean()
        const current = conversation?.lastOwnerMessageAt?.getTime() ?? 0
        if (current > (notice.ownerRevision?.getTime() ?? 0)) return
        const owner = await EvolutionInstanceState.findById(notice.instance).lean()
        const ownerJid = owner?.ownerJid
        if (!ownerJid) return
        // O LID do dono conta como menção em grupos com "Só quando me mencionam" (igual ao turno normal).
        const ownerLid = owner?.ownerLid ?? null
        const { runSecretaryTurn } = await import("./turn")
        const token = randomUUID()
        const reserved = await SecretaryConversation.updateOne({ _id: key, token: null, lastOwnerMessageAt: conversation?.lastOwnerMessageAt ?? null }, { $set: { token, pending: [notice.trigger] } })
        if (reserved.modifiedCount) await runSecretaryTurn({ id: key, chatId: notice.chatId, instance: notice.instance, token, ownerJid, ownerLid, message: notice.trigger, ownerAnswer: answer })
    } catch (error) {
        secretaryLog.error({ ...safeErr(error), noticeId: notice._id, chatId: notice.chatId }, "[secretario] Falha ao retomar a conversa depois da resposta do dono")
    }
}

export async function discardNotice(id: string, actorId: string) {
    await secretaryDb()
    const result = await SecretaryNotice.updateOne({ _id: id, $or: openQuestionFilter() }, { $set: { status: "discarded", answeringAt: null } })
    if (!result.modifiedCount) throw new DomainError(409, "A pergunta não está mais pendente.", "SECRETARY_QUESTION_NOT_PENDING")
    await recordAudit({ userId: actorId, entidade: SECRETARY_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.ATUALIZAR, depois: { acao: "descartar pergunta" } })
    await publishNotices()
}
