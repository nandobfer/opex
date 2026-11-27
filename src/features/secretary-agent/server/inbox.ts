import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { getLocalUser } from "@/lib/local-user"
import { chatMedia, chatTimelinePage, sendChatMedia, sendChatMessage, ChatMediaError } from "@/features/evolution-api/server/chat"
import { conversationJids } from "@/features/evolution-api/server/lid"
import type { ChatMediaFields, ChatSendInput } from "@/features/evolution-api/schemas"
import { SECRETARY_AUDIT_ENTITY } from "../constants"
import { jidOfConversationId } from "../conversation-id"
import type { ChatTimelinePageDto, TimelineDecisionDto } from "../types"
import { safeErr, secretaryLog } from "./log"
import { SecretaryDecisionRecord, SecretaryNotice, SecretarySent, secretaryDb } from "./models"
import { loadSecretarySettings } from "./settings"

/**
 * Aba Conversas como conversa de verdade (OPE-197). Regras do dono (26/11/2026):
 * - D2: o envio pela tela NÃO grava `secretary_sent`; a mensagem volta pelo webhook como `fromMe` e pausa a conversa
 *   como a resposta pelo celular ("Intervenções do dono").
 * - D3: decisões do Secretário viram pílulas e as mensagens enviadas por ele levam o selo "Secretário".
 * - D6: abrir ou ler a conversa nunca marca como lida no WhatsApp.
 * Auditoria e log só com o tipo e a conversa, nunca o conteúdo.
 */

const DECISIONS_PER_PAGE = 500

async function target(chatId: string): Promise<{ instance: string; jid: string }> {
    const jid = jidOfConversationId(chatId)
    const { settings } = await loadSecretarySettings()
    if (!jid || !settings.instance) throw new DomainError(404, "Conversa não encontrada.", "SECRETARY_CHAT_NOT_FOUND")
    return { instance: settings.instance, jid }
}

/** Ids enviados pelo Secretário entre os da página: turno (`messageIds`), perguntas ao dono e o legado de 7 dias. */
async function agentMessageIdsOf(instance: string, chatId: string, ids: string[]): Promise<string[]> {
    if (ids.length === 0) return []
    const [decisions, notices, sent] = await Promise.all([
        SecretaryDecisionRecord.find({ instance, chatId, messageIds: { $in: ids } }).select("messageIds").lean(),
        SecretaryNotice.find({ instance, sentMessageId: { $in: ids } }).select("sentMessageId").lean(),
        SecretarySent.find({ _id: { $in: ids.map((id) => `${instance}:${id}`) }, origin: { $ne: "test" } }).select("_id").lean(),
    ])
    const page = new Set(ids)
    const out = new Set<string>()
    for (const row of decisions) for (const id of row.messageIds ?? []) if (page.has(id)) out.add(id)
    for (const row of notices) if (row.sentMessageId) out.add(row.sentMessageId)
    for (const row of sent) out.add(row._id.slice(instance.length + 1))
    return [...out]
}

/**
 * Página da linha do tempo (`before` ausente = mais recentes). A conversa é lida nas duas metades que a Evolution guarda
 * quando o contato passou a ser endereçado por LID (número e `@lid`, OPE-207).
 */
export async function conversationTimeline(chatId: string, before: Date | null): Promise<ChatTimelinePageDto> {
    const { instance, jid } = await target(chatId)
    await secretaryDb()
    const timeline = await chatTimelinePage(instance, await conversationJids(instance, jid), before)
    const oldest = timeline.items[0]?.timestamp
    // Sem limite superior: o cliente junta as páginas e descarta as repetidas pelo id.
    const range = timeline.hasOlder && oldest ? { at: { $gte: new Date(oldest) } } : {}
    const [decisions, agentMessageIds] = await Promise.all([
        timeline.items.length || !before
            ? SecretaryDecisionRecord.find({ instance, chatId, ...range }).sort({ at: -1 }).limit(DECISIONS_PER_PAGE).select("decision reason at").lean()
            : Promise.resolve([]),
        agentMessageIdsOf(instance, chatId, timeline.items.map((item) => item.id)),
    ])
    const pills: TimelineDecisionDto[] = decisions.map((row) => ({ id: row._id, decision: row.decision, reason: row.reason, at: new Date(row.at).toISOString() }))
    return { ...timeline, decisions: pills, agentMessageIds }
}

async function audit(chatId: string, kind: string) {
    await recordAudit({ userId: getLocalUser().id, entidade: SECRETARY_AUDIT_ENTITY, entidadeId: chatId, acao: AcaoAuditoria.EXECUTAR, depois: { acao: "enviar pela aba Conversas", tipo: kind } })
}

export async function sendFromInbox(chatId: string, input: ChatSendInput): Promise<{ id: string }> {
    const { instance, jid } = await target(chatId)
    try {
        const sent = await sendChatMessage(instance, jid, input)
        await audit(chatId, input.type)
        secretaryLog.info({ instance, chatId, kind: input.type }, "[secretario] Mensagem enviada pela aba Conversas")
        return sent
    } catch (error) {
        secretaryLog.warn({ ...safeErr(error), instance, chatId, kind: input.type }, "[secretario] Falha ao enviar pela aba Conversas")
        throw error
    }
}

export async function sendMediaFromInbox(chatId: string, file: { name: string; type: string; size: number; bytes: Buffer }, fields: ChatMediaFields): Promise<{ id: string }> {
    const { instance, jid } = await target(chatId)
    try {
        const sent = await sendChatMedia(instance, jid, file, fields)
        await audit(chatId, fields.voice ? "voice" : sent.mediaType)
        secretaryLog.info({ instance, chatId, kind: sent.mediaType }, "[secretario] Mídia enviada pela aba Conversas")
        return { id: sent.id }
    } catch (error) {
        if (error instanceof ChatMediaError) throw new DomainError(400, error.message, "SECRETARY_CHAT_MEDIA_INVALID")
        secretaryLog.warn({ ...safeErr(error), instance, chatId }, "[secretario] Falha ao enviar mídia pela aba Conversas")
        throw error
    }
}

export async function inboxMedia(chatId: string, messageId: string) {
    const { instance } = await target(chatId)
    return chatMedia(instance, messageId)
}
