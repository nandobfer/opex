import { LID_JID_SUFFIX, USER_JID_SUFFIX } from "../constants"
import { contactKey, EvolutionContact, evolutionDb } from "./models"

/**
 * Endereçamento por LID (OPE-207): quando o WhatsApp passa a endereçar um contato pelo `<lid>@lid`, a Evolution grava
 * as mensagens novas nesse `remoteJid` (com o número em `remoteJidAlt`, quando vem) e as antigas continuam no número.
 * O Opex guarda a correspondência no contato do número (`lidJid`) e junta as duas metades ao ler a conversa.
 */

export interface LidAlias {
    lid: string
    pn: string
}

/**
 * Grava `lidJid` no contato do número (cria o contato se ainda não existir) e o marca como conversa: a correspondência só
 * vem de mensagens, então a conversa existe, e a lista precisa da metade do número para esconder a do LID.
 */
export async function rememberLidAliases(instance: string, aliases: readonly LidAlias[]): Promise<number> {
    const unique = [...new Map(aliases.map((alias) => [alias.pn, alias])).values()]
    if (unique.length === 0) return 0
    await evolutionDb()
    try {
        const result = await EvolutionContact.bulkWrite(
            unique.map((alias) => ({
                updateOne: {
                    filter: { _id: contactKey(instance, alias.pn) },
                    update: { $set: { lidJid: alias.lid, hasChat: true }, $setOnInsert: { instance, jid: alias.pn, isGroup: false, updatedAt: new Date() } },
                    upsert: true,
                },
            })),
            { ordered: false },
        )
        return (result?.modifiedCount ?? 0) + (result?.upsertedCount ?? 0)
    } catch (error) {
        // Corrida com outro gravador do mesmo contato (upsert duplicado): a correspondência já ficou gravada.
        if ((error as { code?: number }).code === 11000) return 0
        throw error
    }
}

/** `<lid>@lid` com número conhecido vira o número; qualquer outro JID volta igual. */
export async function resolveKnownLid(instance: string, jid: string): Promise<string> {
    if (!jid.endsWith(LID_JID_SUFFIX)) return jid
    await evolutionDb()
    const owner = await EvolutionContact.findOne({ instance, lidJid: jid }).select("jid").lean<{ jid: string } | null>()
    return owner?.jid ?? jid
}

/**
 * Os `remoteJid` em que a Evolution guarda a conversa: o próprio JID e, quando há correspondência, a outra metade
 * (número → LID ou LID → número). O primeiro é sempre o número quando ele é conhecido.
 */
export async function conversationJids(instance: string, jid: string): Promise<string[]> {
    await evolutionDb()
    if (jid.endsWith(USER_JID_SUFFIX)) {
        const row = await EvolutionContact.findOne({ instance, jid }).select("lidJid").lean<{ lidJid?: string | null } | null>()
        return row?.lidJid && row.lidJid !== jid ? [jid, row.lidJid] : [jid]
    }
    if (jid.endsWith(LID_JID_SUFFIX)) {
        const owner = await EvolutionContact.findOne({ instance, lidJid: jid }).select("jid").lean<{ jid: string } | null>()
        return owner ? [owner.jid, jid] : [jid]
    }
    return [jid]
}

/** Correspondências conhecidas, LID → número (a "metade LID" de uma conversa: as listas mostram só a do número). */
export async function lidAliases(instance: string): Promise<Map<string, string>> {
    await evolutionDb()
    const rows = await EvolutionContact.find({ instance, lidJid: { $type: "string" } }).select("jid lidJid").lean<{ jid: string; lidJid?: string | null }[]>()
    return new Map(rows.flatMap((row) => (row.lidJid ? [[row.lidJid, row.jid] as [string, string]] : [])))
}
