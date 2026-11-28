import { loggerFor } from "@/lib/logger"
import { buildChatPage, type ChatEffects, type ChatMessageDto } from "../chat-message"
import { CAPTION_MEDIA_TYPES, validateMediaFile } from "../chat-media-rules"
import { USER_JID_SUFFIX } from "../constants"
import type { EvolutionMessage } from "../evolution-dto"
import { lidAliasOf } from "../message"
import type { ChatMediaFields, ChatSendInput } from "../schemas"
import { evolution, toDomainError } from "./client"
import { conversationJids, rememberLidAliases, type LidAlias } from "./lid"

const log = loggerFor({ feature: "evolution-api" })

/**
 * Conversa de verdade da aba Conversas do Secretário (OPE-197): página da linha do tempo lida da Evolution sob demanda
 * (sem cópia das mensagens no Opex), envios e mídia. Nunca marca como lida (decisão do dono D6, 26/11/2026).
 */

export const CHAT_PAGE_SIZE = 50
/** Tamanho de cada página ao ler um segundo inteiro que sozinho passa de uma página da conversa. */
const SAME_SECOND_MAX = 1000

export interface ChatTimelinePage {
    items: ChatMessageDto[]
    /** Reações, edições e apagamentos cujo alvo está em outra página (o cliente reaplica ao juntar as páginas). */
    effects: ChatEffects
    hasOlder: boolean
    /** Cursor da página anterior (`antes`, inclusivo): o instante da mensagem mais antiga desta página. */
    nextBefore: string | null
}

export interface ConversationMessages {
    /** Mais novas primeiro, sem repetição de id. */
    records: EvolutionMessage[]
    hasOlder: boolean
    nextBefore: Date | null
}

function secondsOf(message: EvolutionMessage): number {
    const value = message.messageTimestamp
    const seconds = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN
    return Number.isFinite(seconds) ? seconds : 0
}

/**
 * Mensagens de uma conversa guardada em um ou mais `remoteJid` (número e `@lid`, OPE-207): lê até `limit` de cada um
 * (até `before`, inclusivo), junta, descarta ids repetidos (a Evolution grava linhas duplicadas) e corta em `limit`.
 * A consulta de um número leva `remoteJidAlt` igual a ele: traz também a metade `@lid`, mesmo sem correspondência conhecida.
 * O cursor seguinte é o segundo da mais antiga; se ele não andou (mais de `limit` no mesmo segundo), a página traz o
 * segundo inteiro (todas as páginas da Evolution) e o cursor recua 1 s.
 */
export async function fetchConversationMessages(instance: string, jids: readonly string[], input: { before?: Date | null; limit: number }, options?: { signal?: AbortSignal }): Promise<ConversationMessages> {
    const { before, limit } = input
    const query = (jid: string, from: Date | null, to: Date | null, pageSize: number, page?: number) => evolution.findMessages(instance, {
        remoteJid: jid,
        ...(jid.endsWith(USER_JID_SUFFIX) ? { remoteJidAlt: jid } : {}),
        ...(page ? { page } : {}),
        pageSize,
        ...(to ? { from: from ?? new Date(0), to } : {}),
    }, options)
    const read = (from: Date | null, to: Date | null, pageSize: number) => Promise.all(jids.map((jid) => query(jid, from, to, pageSize)))
    /** Todas as páginas de um segundo exato (o teto vale por página, não para o segundo). */
    const readSecond = (at: Date) => Promise.all(jids.map(async (jid) => {
        const first = await query(jid, at, at, SAME_SECOND_MAX, 1)
        const rest = []
        for (let page = 2; page <= first.pages; page++) rest.push(await query(jid, at, at, SAME_SECOND_MAX, page))
        return { records: [first, ...rest].flatMap((item) => item.records) }
    }))
    const pages = await read(null, before ?? null, limit)
    const byId = new Map<string, EvolutionMessage>()
    const add = (list: readonly { records: EvolutionMessage[] }[]) => { for (const page of list) for (const record of page.records) if (!byId.has(record.key.id)) byId.set(record.key.id, record) }
    add(pages)
    const merged = [...byId.values()].sort((a, b) => secondsOf(b) - secondsOf(a))
    let records = merged.slice(0, limit)
    const hasOlder = records.length > 0 && (merged.length > limit || pages.some((page) => page.total > page.records.length))
    let nextBefore: Date | null = null
    if (hasOlder) {
        let cursor = secondsOf(records[records.length - 1]!)
        if (before && cursor * 1000 >= before.getTime()) {
            // O cursor não andou: há mais de `limit` mensagens no mesmo segundo. Lê o segundo inteiro (sem cortar em `limit`)
            // antes de recuar, para nenhuma ficar de fora.
            const second = Math.floor(before.getTime() / 1000)
            byId.clear()
            add(await readSecond(new Date(second * 1000)))
            records = [...byId.values()]
            cursor = second - 1
        }
        nextBefore = new Date(cursor * 1000)
    }
    learnLidAliases(instance, records)
    return { records, hasOlder, nextBefore }
}

/**
 * Mensagens do `@lid` com o número em `remoteJidAlt` ensinam a correspondência ao abrir a conversa (lista e webhook passam a
 * juntar as metades). Em segundo plano: não segura a página, e a falha só vai para o log.
 */
function learnLidAliases(instance: string, records: readonly EvolutionMessage[]): void {
    const aliases = new Map<string, LidAlias>()
    for (const record of records) {
        const alias = lidAliasOf(record.key)
        if (alias) aliases.set(alias.pn, alias)
    }
    if (aliases.size === 0) return
    void rememberLidAliases(instance, [...aliases.values()]).catch((error: unknown) => {
        log.warn({ errorKind: error instanceof Error ? error.name : typeof error, instance }, "[evolution] Falha ao gravar a correspondência LID ↔ número pela conversa")
    })
}

/** As `limit` mensagens mais recentes da conversa (mais novas primeiro), juntando número e `@lid` (histórico do Secretário). */
export async function recentConversationMessages(instance: string, jid: string, limit: number): Promise<EvolutionMessage[]> {
    return (await fetchConversationMessages(instance, await conversationJids(instance, jid), { limit })).records
}

/** Página da conversa (sem `before` = mais recentes) já no formato da conversa, mais antigas primeiro. */
export async function chatTimelinePage(instance: string, jids: readonly string[], before: Date | null): Promise<ChatTimelinePage> {
    try {
        const result = await fetchConversationMessages(instance, jids, { before, limit: CHAT_PAGE_SIZE })
        const { items, orphanEffects } = buildChatPage(result.records)
        return { items, effects: orphanEffects, hasOlder: result.hasOlder, nextBefore: result.nextBefore?.toISOString() ?? null }
    } catch (error) {
        toDomainError(error)
    }
}

/** Texto, reação, localização ou contato. Devolve o id da mensagem enviada. */
export async function sendChatMessage(instance: string, jid: string, input: ChatSendInput): Promise<{ id: string }> {
    try {
        const sent =
            input.type === "text" ? await evolution.sendText(instance, { number: jid, text: input.text, quotedId: input.quotedId })
            : input.type === "reaction" ? await evolution.sendReaction(instance, { remoteJid: jid, id: input.messageId, fromMe: input.fromMe, reaction: input.emoji })
            : input.type === "location" ? await evolution.sendLocation(instance, { number: jid, latitude: input.latitude, longitude: input.longitude, name: input.name, address: input.address, quotedId: input.quotedId })
            : await evolution.sendContact(instance, { number: jid, contacts: input.contacts, quotedId: input.quotedId })
        return { id: sent.key.id }
    } catch (error) {
        toDomainError(error)
    }
}

export class ChatMediaError extends Error {}

/** Foto, vídeo, documento ou voz (validados pelas regras do WhatsApp). */
export async function sendChatMedia(instance: string, jid: string, file: { name: string; type: string; size: number; bytes: Buffer }, fields: ChatMediaFields): Promise<{ id: string; mediaType: string }> {
    const check = validateMediaFile({ mimeType: file.type, fileName: file.name, size: file.size }, fields.voice ? "audio" : undefined)
    if (!check.ok) throw new ChatMediaError(check.message)
    const base64 = file.bytes.toString("base64")
    try {
        if (check.mediaType === "audio") {
            const sent = await evolution.sendWhatsAppAudio(instance, { number: jid, base64, quotedId: fields.quotedId })
            return { id: sent.key.id, mediaType: "audio" }
        }
        const caption = CAPTION_MEDIA_TYPES.includes(check.mediaType) ? fields.caption : undefined
        const sent = await evolution.sendMedia(instance, { number: jid, mediatype: check.mediaType, mimetype: check.mimeType, base64, fileName: file.name, caption, quotedId: fields.quotedId })
        return { id: sent.key.id, mediaType: check.mediaType }
    } catch (error) {
        toDomainError(error)
    }
}

/** Binário de uma mídia recebida ou enviada. */
export async function chatMedia(instance: string, messageId: string): Promise<{ bytes: Buffer; mimetype: string; fileName: string | null }> {
    try {
        const media = await evolution.mediaBase64(instance, messageId)
        return { bytes: Buffer.from(media.base64, "base64"), mimetype: media.mimetype ?? "application/octet-stream", fileName: media.fileName ?? null }
    } catch (error) {
        toDomainError(error)
    }
}
