import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { publishAppEvent } from "@/lib/pusher/channels"
import { listContacts } from "@/features/evolution-api/server/contacts"
import { lidAliases } from "@/features/evolution-api/server/lid"
import type { EvolutionContactDto } from "@/features/evolution-api/types"
import { SECRETARY_AUDIT_ENTITY, SECRETARY_CONVERSATION_EVENT, type ConversationAgentState } from "../constants"
import { conversationIdOfJid, jidOfConversationId } from "../conversation-id"
import type { ConversationActionInput } from "../schemas"
import { SecretaryConversation, SecretaryNotice, secretaryDb } from "./models"
import { loadSecretarySettings, saveSecretarySettings } from "./settings"

export async function listSecretaryConversations() {
    await secretaryDb()
    const { settings } = await loadSecretarySettings()
    if (!settings.instance) return []
    const instance = settings.instance
    const [contacts, states, notices, lids] = await Promise.all([
        listContacts("chats", instance),
        SecretaryConversation.find({ instance }).select("jid pausedUntil").lean(),
        SecretaryNotice.distinct("chatId", { instance, status: "pending" }),
        lidAliases(instance),
    ])
    const byJid = new Map(states.map((row) => [row.jid, row]))
    return mergeLidHalves(contacts, lids).flatMap((contact) => {
        const chatId = conversationIdOfJid(contact.jid)
        if (!chatId) return []
        const paused = byJid.get(contact.jid)?.pausedUntil
        const state: ConversationAgentState = settings.criteria.audience.blocked.includes(contact.jid) ? "excluded" : paused && paused > new Date() ? "paused" : notices.includes(chatId) ? "waiting-owner" : "active"
        return [{ ...contact, chatId, state, pausedUntil: paused?.toISOString() ?? null }]
    })
}

/**
 * A metade `@lid` de uma conversa com número conhecido (OPE-207) entra na do número: some da lista só quando a do número
 * está nela, que fica com a prévia e o horário mais recentes das duas e a soma das não lidas (reordenada pelo horário).
 */
export function mergeLidHalves(contacts: readonly EvolutionContactDto[], aliases: ReadonlyMap<string, string>): EvolutionContactDto[] {
    const byJid = new Map(contacts.map((contact) => [contact.jid, contact]))
    const lidOf = new Map([...aliases].filter(([lid, pn]) => byJid.has(lid) && byJid.has(pn)).map(([lid, pn]) => [pn, lid]))
    if (lidOf.size === 0) return [...contacts]
    const hidden = new Set(lidOf.values())
    const merged = contacts.flatMap((contact) => {
        if (hidden.has(contact.jid)) return []
        const lid = lidOf.get(contact.jid)
        const half = lid ? byJid.get(lid) : undefined
        if (!half) return [contact]
        const newer = (half.lastMessageAt ?? "") > (contact.lastMessageAt ?? "")
        return [{
            ...contact,
            pictureUrl: contact.pictureUrl ?? half.pictureUrl,
            lastMessageAt: newer ? half.lastMessageAt : contact.lastMessageAt,
            lastMessage: newer ? half.lastMessage : contact.lastMessage ?? half.lastMessage,
            unreadCount: (contact.unreadCount ?? 0) + (half.unreadCount ?? 0),
        }]
    })
    return merged.sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""))
}

export async function changeConversation(chatId: string, input: ConversationActionInput, actor: string) {
    const jid = jidOfConversationId(chatId)
    const { settings } = await loadSecretarySettings()
    if (!jid || !settings.instance) throw new DomainError(404, "Conversa não encontrada.")
    await secretaryDb()
    if (input.action === "pause" || input.action === "resume") {
        const pausedUntil = input.action === "pause" ? new Date(Date.now() + input.minutes * 60_000) : null
        await SecretaryConversation.updateOne({ _id: `${settings.instance}:${chatId}` }, { $set: { pausedUntil }, $setOnInsert: { instance: settings.instance, jid } }, { upsert: true })
    } else {
        // "Excluir dos critérios" = "Nunca responder a" (etapa 1 dos critérios).
        const blocked = settings.criteria.audience.blocked.filter((item) => item !== jid)
        if (input.action === "exclude") blocked.push(jid)
        await saveSecretarySettings({ ...settings, criteria: { ...settings.criteria, audience: { ...settings.criteria.audience, blocked } } }, actor)
    }
    await recordAudit({ userId: actor, entidade: SECRETARY_AUDIT_ENTITY, entidadeId: chatId, acao: AcaoAuditoria.ATUALIZAR, depois: { action: input.action } })
    await publishAppEvent(SECRETARY_CONVERSATION_EVENT, { chatId })
    return { saved: true }
}
