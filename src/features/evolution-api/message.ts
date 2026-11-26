import { isGroupJid, jidNumber, LID_JID_SUFFIX, normalizeJid } from "./constants"
import type { EvolutionMessage } from "./evolution-dto"

/**
 * Leitura pura de uma mensagem da Evolution (formato `prepareMessage` da 2.3.8): texto, mídia, citação e
 * menções. Usada pelo webhook, pelo Agente Secretário e pela análise de personalidade.
 */

export type MediaKind = "image" | "audio" | "video" | "document" | "sticker"

export interface ParsedMessage {
    id: string
    /** JID da conversa (contato ou grupo), sem dispositivo; para `@lid`, o `remoteJidAlt` quando vier. */
    chatJid: string
    fromMe: boolean
    isGroup: boolean
    /** Autor dentro do grupo (`participant`), sem dispositivo. */
    participant: string | null
    pushName: string | null
    text: string
    media: { kind: MediaKind; mimetype: string | null; fileName: string | null } | null
    /** Id da mensagem citada (`contextInfo.stanzaId`). */
    quotedId: string | null
    /** Autor da mensagem citada (`contextInfo.participant`). */
    quotedAuthor: string | null
    mentioned: string[]
    timestamp: Date
    /** Tipos que não são conversa (reação, protocolo, enquete…): o agente ignora. */
    ignorable: boolean
}

const MEDIA_TYPES: Record<string, MediaKind> = {
    imageMessage: "image",
    audioMessage: "audio",
    videoMessage: "video",
    ptvMessage: "video",
    documentMessage: "document",
    stickerMessage: "sticker",
}

const IGNORABLE = new Set(["reactionMessage", "protocolMessage", "pollUpdateMessage", "senderKeyDistributionMessage", "messageContextInfo", "editedMessage", "unknown"])

const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value : null)

function record(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

/** Conversa da mensagem: `@lid` vira o número real quando a Evolution manda `remoteJidAlt`. */
export function chatJidOf(key: { remoteJid: string; remoteJidAlt?: string | null }): string {
    const jid = normalizeJid(key.remoteJid)
    if (jid.endsWith(LID_JID_SUFFIX) && key.remoteJidAlt) return normalizeJid(key.remoteJidAlt)
    return jid
}

export function parseEvolutionMessage(message: EvolutionMessage): ParsedMessage {
    const body = record(message.message) ?? {}
    const type = message.messageType ?? Object.keys(body)[0] ?? "unknown"
    const kind = MEDIA_TYPES[type] ?? null
    const content = record(body[type])
    const context = record(message.contextInfo) ?? record(content?.contextInfo) ?? {}
    const text = str(body.conversation) ?? str(record(body.extendedTextMessage)?.text) ?? str(content?.caption) ?? str(content?.text) ?? ""
    const ts = message.messageTimestamp
    const seconds = typeof ts === "number" ? ts : typeof ts === "string" ? Number(ts) : NaN
    const chatJid = chatJidOf(message.key)
    const mentioned = Array.isArray(context.mentionedJid) ? context.mentionedJid.filter((item): item is string => typeof item === "string").map(normalizeJid) : []
    return {
        id: message.key.id,
        chatJid,
        fromMe: message.key.fromMe === true,
        isGroup: isGroupJid(chatJid),
        participant: message.key.participant ? normalizeJid(message.key.participantAlt ?? message.key.participant) : null,
        pushName: message.pushName ?? null,
        text,
        media: kind ? { kind, mimetype: str(content?.mimetype), fileName: str(content?.fileName) ?? str(content?.title) } : null,
        quotedId: str(context.stanzaId),
        quotedAuthor: str(context.participant) ? normalizeJid(String(context.participant)) : null,
        mentioned,
        timestamp: Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : new Date(),
        ignorable: !kind && !text && IGNORABLE.has(type),
    }
}

/** Marcador textual de uma mídia (quando não é lida pelo modelo). */
export function mediaMarker(media: ParsedMessage["media"]): string {
    if (!media) return ""
    if (media.kind === "image") return "[imagem]"
    if (media.kind === "audio") return "[áudio]"
    if (media.kind === "video") return "[vídeo]"
    if (media.kind === "sticker") return "[figurinha]"
    return media.fileName ? `[documento: ${media.fileName}]` : "[documento]"
}

/** Texto da mensagem para o histórico: o texto e, com mídia, o marcador antes. */
export function messageDisplayText(message: Pick<ParsedMessage, "text" | "media">): string {
    const marker = mediaMarker(message.media)
    return [marker, message.text].filter(Boolean).join(" ")
}

/** A mensagem cita ou menciona o dono (`ownerJid`): conta como "mencionado" em grupo. */
export function mentionsOwner(message: Pick<ParsedMessage, "mentioned" | "quotedAuthor" | "text">, ownerJid: string | null, ownerLid?: string | null): boolean {
    if (!ownerJid) return false
    const owner = normalizeJid(ownerJid)
    const number = jidNumber(owner)
    const ids = new Set([owner, ownerLid ? normalizeJid(ownerLid) : ""].filter(Boolean))
    if (message.mentioned.some((jid) => ids.has(jid) || jidNumber(jid) === number)) return true
    if (message.quotedAuthor && (ids.has(message.quotedAuthor) || jidNumber(message.quotedAuthor) === number)) return true
    return number.length > 0 && message.text.includes(`@${number}`)
}
