import { isGroupJid, jidNumber } from "@/features/evolution-api/constants"
import { contactsByJid } from "@/features/evolution-api/server/contacts"
import type { SecretaryContact } from "../contact"
import { safeErr, secretaryLog } from "./log"

/** `contactName` devolve `+<número>` ou "Grupo sem nome" quando o cache não tem nome: isso não é nome conhecido. */
function knownName(name: string | undefined, jid: string): string | null {
    const value = name?.trim()
    if (!value || value === "Grupo sem nome" || value === `+${jidNumber(jid)}`) return null
    return value
}

/**
 * Lê o contato (ou o grupo e o autor) do cache `evolution_contacts`, com o `pushName` como alternativa. Se o cache
 * falhar, segue só com o número e registra um aviso, sem quebrar o turno.
 */
export async function resolveSecretaryContact(input: { jid: string; participant?: string | null; pushName?: string | null; author?: string | null; instance?: string | null }): Promise<SecretaryContact> {
    const isGroup = isGroupJid(input.jid)
    const number = isGroup ? null : jidNumber(input.jid) || null
    const pushName = input.pushName?.trim() || null
    let contacts = new Map<string, { name: string }>()
    try {
        contacts = await contactsByJid([input.jid, ...(input.participant ? [input.participant] : [])], input.instance ?? undefined)
    } catch (error) {
        secretaryLog.warn({ ...safeErr(error) }, "[secretario] Cache de contatos indisponível: segue só com o número")
    }
    const name = knownName(contacts.get(input.jid)?.name, input.jid)
    if (!isGroup) return { name: name ?? pushName, number, isGroup, groupName: null, author: null }
    const author = (input.participant ? knownName(contacts.get(input.participant)?.name, input.participant) : null) ?? pushName ?? input.author ?? null
    return { name, number: null, isGroup, groupName: name, author }
}
