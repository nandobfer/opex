import { buildChatPage, type ChatEffects, type ChatMessageDto } from "../chat-message"
import { CAPTION_MEDIA_TYPES, validateMediaFile } from "../chat-media-rules"
import type { ChatMediaFields, ChatSendInput } from "../schemas"
import { evolution, toDomainError } from "./client"

/**
 * Conversa de verdade da aba Conversas do Secretário (OPE-197): página da linha do tempo lida da Evolution sob demanda
 * (sem cópia das mensagens no Opex), envios e mídia. Nunca marca como lida (decisão do dono D6, 26/11/2026).
 */

export const CHAT_PAGE_SIZE = 50

export interface ChatTimelinePage {
    items: ChatMessageDto[]
    /** Reações, edições e apagamentos cujo alvo está em outra página (o cliente reaplica ao juntar as páginas). */
    effects: ChatEffects
    page: number
    hasOlder: boolean
}

/** Página `page` (1 = mais recentes) já no formato da conversa, mais antigas primeiro. */
export async function chatTimelinePage(instance: string, jid: string, page: number): Promise<ChatTimelinePage> {
    try {
        const result = await evolution.findMessages(instance, { remoteJid: jid, page, pageSize: CHAT_PAGE_SIZE })
        const { items, orphanEffects } = buildChatPage(result.records)
        return { items, effects: orphanEffects, page, hasOlder: result.page < result.pages }
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
