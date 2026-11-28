
import { isGroupJid, jidNumber, normalizeJid } from "../constants"
import { lidAliasOf } from "../message"
import type { ContactKind, SendTestInput } from "../schemas"
import type { EvolutionContactDto, EvolutionNumberCheckDto } from "../types"
import { evolution, toDomainError } from "./client"
import { defaultInstanceName } from "./instances"
import { rememberLidAliases } from "./lid"
import { EvolutionContact, evolutionDb, type IEvolutionContact } from "./models"
import { AcaoAuditoria, auditEvolution, evolutionLog, publishEvolution } from "./shared"
import { upsertContacts } from "./webhook"

/** Contatos, grupos e conversas com foto (cache `evolution_contacts`), sincronização e operações de teste. */

export function contactName(contact: Pick<IEvolutionContact, "jid" | "name" | "pushName">): string {
    return contact.name?.trim() || contact.pushName?.trim() || (isGroupJid(contact.jid) ? "Grupo sem nome" : `+${jidNumber(contact.jid)}`)
}

export function toContactDto(contact: IEvolutionContact): EvolutionContactDto {
    return {
        jid: contact.jid,
        name: contactName(contact),
        number: contact.isGroup ? null : jidNumber(contact.jid) || null,
        pictureUrl: contact.pictureUrl ?? null,
        isGroup: contact.isGroup,
        lastMessageAt: contact.lastMessageAt?.toISOString() ?? null,
        lastMessage: contact.lastMessage ? { text: contact.lastMessage.text, kind: contact.lastMessage.kind, fromMe: contact.lastMessage.fromMe } : null,
        unreadCount: contact.unreadCount ?? 0,
    }
}

const KIND_FILTER: Record<ContactKind, Record<string, unknown>> = {
    contacts: { isGroup: false, jid: { $regex: "@s\\.whatsapp\\.net$" } },
    groups: { isGroup: true },
    chats: { hasChat: true },
}

export async function listContacts(kind: ContactKind, instance?: string): Promise<EvolutionContactDto[]> {
    const name = instance ?? (await defaultInstanceName())
    await evolutionDb()
    const rows = await EvolutionContact.find({ instance: name, ...KIND_FILTER[kind] })
        .sort({ lastMessageAt: -1, name: 1 })
        .limit(5000)
        .lean<IEvolutionContact[]>()
    return rows.map(toContactDto)
}

/** Contatos conhecidos por JID (rótulos de conversa: nome e foto). */
export async function contactsByJid(jids: string[], instance?: string): Promise<Map<string, EvolutionContactDto>> {
    if (jids.length === 0) return new Map()
    const name = instance ?? (await defaultInstanceName().catch(() => null))
    if (!name) return new Map()
    await evolutionDb()
    const rows = await EvolutionContact.find({ instance: name, jid: { $in: jids } }).lean<IEvolutionContact[]>()
    return new Map(rows.map((row) => [row.jid, toContactDto(row)]))
}

/** Sincroniza fotos e nomes de contatos, grupos e conversas a partir da Evolution. */
export async function syncContacts(actorId: string): Promise<{ contacts: number; groups: number; chats: number }> {
    const instance = await defaultInstanceName()
    let counts = { contacts: 0, groups: 0, chats: 0 }
    try {
        const [contacts, groups, chats] = await Promise.all([evolution.findContacts(instance), evolution.fetchGroups(instance), evolution.findChats(instance)])
        await upsertContacts(
            instance,
            contacts.filter((item) => item.remoteJid.includes("@")).map((item) => ({ jid: normalizeJid(item.remoteJid), name: null, pushName: item.pushName ?? null, pictureUrl: item.profilePicUrl ?? null, isGroup: isGroupJid(item.remoteJid) })),
        )
        await upsertContacts(
            instance,
            groups.map((group) => ({ jid: normalizeJid(group.id), name: group.subject ?? null, pushName: null, pictureUrl: group.pictureUrl ?? null, isGroup: true })),
        )
        await upsertContacts(
            instance,
            chats
                .filter((chat) => chat.remoteJid.includes("@") && chat.remoteJid !== "status@broadcast")
                .map((chat) => ({ jid: normalizeJid(chat.remoteJid), name: chat.name ?? null, pushName: chat.pushName ?? null, pictureUrl: chat.profilePicUrl ?? null, isGroup: isGroupJid(chat.remoteJid), unreadCount: typeof chat.unreadMessages === "number" ? chat.unreadMessages : null })),
            { hasChat: true },
        )
        // Conversa `@lid` cuja última mensagem traz o número: preenche a correspondência das conversas já partidas (OPE-207).
        await rememberLidAliases(instance, chats.flatMap((chat) => {
            const alias = chat.lastMessage?.key ? lidAliasOf(chat.lastMessage.key) : null
            return alias ? [alias] : []
        }))
        counts = { contacts: contacts.length, groups: groups.length, chats: chats.length }
    } catch (error) {
        toDomainError(error)
    }
    await auditEvolution(actorId, instance, AcaoAuditoria.EXECUTAR, { acao: "sincronizar contatos", ...counts })
    evolutionLog.info({ instance, ...counts }, "[evolution] Contatos sincronizados")
    await publishEvolution("contacts", instance)
    return counts
}

export async function sendTestMessage(input: SendTestInput, actorId: string): Promise<{ id: string }> {
    const instance = await defaultInstanceName()
    let id = ""
    try {
        const sent = await evolution.sendText(instance, { number: input.number, text: input.text })
        id = sent.key.id
        // Volta pelo webhook como `fromMe`: registrada como envio do Opex, não conta como o dono assumindo a conversa.
        const { SecretarySent, secretaryDb } = await import("@/features/secretary-agent/server/models")
        await secretaryDb()
        await SecretarySent.updateOne({ _id: `${instance}:${id}` }, { $setOnInsert: { sentAt: new Date(), origin: "test" } }, { upsert: true })
    } catch (error) {
        toDomainError(error)
    }
    // O texto não vai para a auditoria (conteúdo de mensagem): só o destino.
    await auditEvolution(actorId, instance, AcaoAuditoria.EXECUTAR, { acao: "mensagem de teste", numero: input.number })
    return { id }
}

export async function checkNumber(number: string): Promise<EvolutionNumberCheckDto> {
    const instance = await defaultInstanceName()
    try {
        const [result] = await evolution.whatsappNumbers(instance, [number])
        return { number, exists: result?.exists === true, jid: result?.jid ?? null, name: result?.name ?? null }
    } catch (error) {
        toDomainError(error)
    }
}
