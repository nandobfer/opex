import { normalizeJid } from "./constants"
import type { EvolutionMessage } from "./evolution-dto"
import { chatJidOf } from "./message"

/**
 * Mensagens da Evolution (formato `prepareMessage` da 2.3.8) no formato da conversa da aba Conversas do Secretário
 * (OPE-197, molde do Atendimento do Zaturno CRM). Módulo PURO e tolerante: campo ausente vira neutro. O
 * `parseEvolutionMessage` do turno continua separado.
 */

export type ChatMessageKind = "text" | "image" | "video" | "audio" | "document" | "sticker" | "location" | "contact" | "deleted" | "unsupported"
export type ChatMessageStatus = "pending" | "sent" | "delivered" | "read" | "failed"

export interface ChatMediaDto {
    kind: "image" | "video" | "audio" | "document" | "sticker"
    mimetype: string | null
    fileName: string | null
    /** Duração (áudio e vídeo), em segundos. */
    seconds: number | null
    /** Áudio gravado (mensagem de voz). */
    voice: boolean
}

export interface ChatReactionDto {
    emoji: string
    fromMe: boolean
    author: string | null
}

export interface ChatMessageDto {
    id: string
    chatJid: string
    fromMe: boolean
    /** Autor no grupo (sem dispositivo) e o nome que o WhatsApp mostrou. */
    author: string | null
    authorName: string | null
    timestamp: string
    kind: ChatMessageKind
    text: string
    media: ChatMediaDto | null
    quoted: { id: string; text: string; author: string | null } | null
    location: { latitude: number; longitude: number; name: string | null; address: string | null } | null
    contacts: { name: string; number: string | null }[]
    reactions: ChatReactionDto[]
    edited: boolean
    status: ChatMessageStatus | null
}

const MEDIA: Record<string, ChatMediaDto["kind"]> = { imageMessage: "image", videoMessage: "video", ptvMessage: "video", audioMessage: "audio", documentMessage: "document", stickerMessage: "sticker" }

const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value : null)
const num = (value: unknown): number | null => {
    const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN
    return Number.isFinite(parsed) ? parsed : null
}
function record(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

/** Status da Evolution (`SERVER_ACK`, `DELIVERY_ACK`, `READ`, `PLAYED`, `ERROR`, `PENDING`) ou o número do Baileys. */
export function chatStatusOf(value: unknown): ChatMessageStatus | null {
    if (typeof value === "number") return value <= 1 ? "pending" : value === 2 ? "sent" : value === 3 ? "delivered" : "read"
    const status = str(value)?.toUpperCase()
    if (!status) return null
    if (status === "ERROR") return "failed"
    if (status === "PENDING") return "pending"
    if (status === "SERVER_ACK") return "sent"
    if (status === "DELIVERY_ACK") return "delivered"
    if (status === "READ" || status === "PLAYED") return "read"
    return null
}

/** Número do vCard (`waid=` ou `TEL`). */
export function vcardNumber(vcard: string | null): string | null {
    if (!vcard) return null
    const waid = /waid=(\d+)/.exec(vcard)?.[1]
    if (waid) return waid
    const tel = /TEL[^:]*:([+\d\s()-]+)/.exec(vcard)?.[1]
    return tel ? tel.replace(/\D/g, "") || null : null
}

function textOf(body: Record<string, unknown>, content: Record<string, unknown> | null): string {
    return str(body.conversation) ?? str(record(body.extendedTextMessage)?.text) ?? str(content?.caption) ?? str(content?.text) ?? ""
}

function unwrap(body: Record<string, unknown>): Record<string, unknown> {
    // `documentWithCaptionMessage`, `ephemeralMessage` e `viewOnceMessage*` embrulham a mensagem real.
    for (const key of ["documentWithCaptionMessage", "ephemeralMessage", "viewOnceMessage", "viewOnceMessageV2"]) {
        const inner = record(record(body[key])?.message)
        if (inner) return unwrap(inner)
    }
    return body
}

interface Raw {
    message: EvolutionMessage
    body: Record<string, unknown>
    type: string
}

function rawOf(message: EvolutionMessage): Raw {
    const body = unwrap(record(message.message) ?? {})
    const declared = message.messageType && body[message.messageType] !== undefined ? message.messageType : null
    const type = declared ?? Object.keys(body).find((key) => key !== "messageContextInfo") ?? "unknown"
    return { message, body, type }
}

function timestampOf(message: EvolutionMessage): string {
    const seconds = num(message.messageTimestamp)
    return new Date(seconds && seconds > 0 ? seconds * 1000 : Date.now()).toISOString()
}

function authorOf(message: EvolutionMessage): string | null {
    const participant = message.key.participantAlt ?? message.key.participant
    return participant ? normalizeJid(participant) : null
}

function quotedOf(message: EvolutionMessage, content: Record<string, unknown> | null): ChatMessageDto["quoted"] {
    const context = record(message.contextInfo) ?? record(content?.contextInfo)
    const id = str(context?.stanzaId)
    if (!id) return null
    const quoted = record(context?.quotedMessage) ?? {}
    const inner = unwrap(quoted)
    const type = Object.keys(inner)[0] ?? ""
    const mediaKind = MEDIA[type]
    const text = textOf(inner, record(inner[type])) || (mediaKind ? MEDIA_LABELS[mediaKind] : type === "locationMessage" ? "Localização" : type.startsWith("contact") ? "Contato" : "")
    return { id, text, author: str(context?.participant) ? normalizeJid(String(context?.participant)) : null }
}

const MEDIA_LABELS: Record<ChatMediaDto["kind"], string> = { image: "Foto", video: "Vídeo", audio: "Áudio", document: "Documento", sticker: "Figurinha" }

function toDto({ message, body, type }: Raw): ChatMessageDto {
    const content = record(body[type])
    const mediaKind = MEDIA[type] ?? null
    const base: ChatMessageDto = {
        id: message.key.id,
        chatJid: chatJidOf(message.key),
        fromMe: message.key.fromMe === true,
        author: authorOf(message),
        authorName: str(message.pushName),
        timestamp: timestampOf(message),
        kind: "unsupported",
        text: textOf(body, content),
        media: null,
        quoted: quotedOf(message, content),
        location: null,
        contacts: [],
        reactions: [],
        edited: false,
        status: chatStatusOf((message as Record<string, unknown>).status),
    }
    if (mediaKind) {
        return {
            ...base,
            kind: mediaKind,
            media: { kind: mediaKind, mimetype: str(content?.mimetype), fileName: str(content?.fileName) ?? str(content?.title), seconds: num(content?.seconds), voice: mediaKind === "audio" && content?.ptt === true },
        }
    }
    if (type === "locationMessage" || type === "liveLocationMessage") {
        const latitude = num(content?.degreesLatitude)
        const longitude = num(content?.degreesLongitude)
        if (latitude !== null && longitude !== null) return { ...base, kind: "location", text: str(content?.caption) ?? "", location: { latitude, longitude, name: str(content?.name), address: str(content?.address) } }
    }
    if (type === "contactMessage") return { ...base, kind: "contact", text: "", contacts: [{ name: str(content?.displayName) ?? "Contato", number: vcardNumber(str(content?.vcard)) }] }
    if (type === "contactsArrayMessage") {
        const list = Array.isArray(content?.contacts) ? content.contacts : []
        return { ...base, kind: "contact", text: "", contacts: list.map(record).filter((item): item is Record<string, unknown> => item !== null).map((item) => ({ name: str(item.displayName) ?? "Contato", number: vcardNumber(str(item.vcard)) })) }
    }
    if (base.text) return { ...base, kind: "text" }
    return base
}

/** Edição (`protocolMessage` de edição ou `editedMessage`): id da mensagem e o novo texto. */
function editOf(raw: Raw): { id: string; text: string } | null {
    const protocol = record(raw.body.protocolMessage) ?? record(record(record(raw.body.editedMessage)?.message)?.protocolMessage)
    const edited = record(protocol?.editedMessage)
    const id = str(record(protocol?.key)?.id)
    if (!protocol || !edited || !id) return null
    return { id, text: textOf(edited, record(edited[Object.keys(edited)[0] ?? ""])) }
}

/** Revogação ("apagar para todos"): id da mensagem apagada. */
function revokeOf(raw: Raw): string | null {
    const protocol = record(raw.body.protocolMessage)
    if (!protocol) return null
    const kind = protocol.type
    const revoke = kind === "REVOKE" || kind === 0
    return revoke ? str(record(protocol.key)?.id) : null
}

function reactionOf(raw: Raw): { targetId: string; reaction: ChatReactionDto } | null {
    if (raw.type !== "reactionMessage") return null
    const content = record(raw.body.reactionMessage)
    const targetId = str(record(content?.key)?.id)
    if (!targetId) return null
    return { targetId, reaction: { emoji: typeof content?.text === "string" ? content.text : "", fromMe: raw.message.key.fromMe === true, author: authorOf(raw.message) } }
}

const reactionAuthor = (reaction: ChatReactionDto) => (reaction.fromMe ? "me" : (reaction.author ?? "contact"))

/**
 * Efeitos sobre outras mensagens (reação, edição, apagar para todos), em ordem de horário. A paginação pode deixar o
 * efeito numa página e o alvo em outra: a página devolve os efeitos sem alvo nela (`orphanEffects`) e o cliente os
 * reaplica ao juntar as páginas (`applyChatEffects`).
 */
export interface ChatEffects {
    reactions: { targetId: string; at: string; reaction: ChatReactionDto }[]
    edits: { targetId: string; at: string; text: string }[]
    revoked: string[]
}

const emptyEffects = (): ChatEffects => ({ reactions: [], edits: [], revoked: [] })

function splitRecords(records: readonly EvolutionMessage[]): { messages: ChatMessageDto[]; effects: ChatEffects } {
    const raws = records.map(rawOf).sort((a, b) => timestampOf(a.message).localeCompare(timestampOf(b.message)))
    const messages = new Map<string, ChatMessageDto>()
    const effects = emptyEffects()
    for (const raw of raws) {
        const at = timestampOf(raw.message)
        const reaction = reactionOf(raw)
        if (reaction) {
            effects.reactions.push({ targetId: reaction.targetId, at, reaction: reaction.reaction })
            continue
        }
        const edit = editOf(raw)
        if (edit) {
            effects.edits.push({ targetId: edit.id, at, text: edit.text })
            continue
        }
        const revoke = revokeOf(raw)
        if (revoke) {
            effects.revoked.push(revoke)
            continue
        }
        if (raw.body.protocolMessage || raw.type === "senderKeyDistributionMessage" || raw.type === "messageContextInfo") continue
        messages.set(raw.message.key.id, toDto(raw))
    }
    return { messages: [...messages.values()], effects }
}

/**
 * Aplica os efeitos sobre as mensagens: reações agregadas na mensagem alvo (a última de cada autor vale, por cima das
 * que a mensagem já tem; vazia remove), a última edição e a revogação ("Mensagem apagada").
 */
export function applyChatEffects(messages: readonly ChatMessageDto[], effects: ChatEffects): ChatMessageDto[] {
    const byTime = <T extends { at: string }>(list: readonly T[]) => [...list].sort((a, b) => a.at.localeCompare(b.at))
    const reactions = new Map<string, Map<string, ChatReactionDto>>()
    for (const item of byTime(effects.reactions)) {
        const byAuthor = reactions.get(item.targetId) ?? new Map<string, ChatReactionDto>()
        byAuthor.set(reactionAuthor(item.reaction), item.reaction)
        reactions.set(item.targetId, byAuthor)
    }
    const edits = new Map(byTime(effects.edits).map((item) => [item.targetId, item.text]))
    const revoked = new Set(effects.revoked)
    return messages.map((message) => {
        if (revoked.has(message.id)) return { ...message, kind: "deleted" as const, text: "", media: null, location: null, contacts: [], quoted: null, reactions: [] }
        const edited = edits.get(message.id)
        const extra = reactions.get(message.id)
        let list = message.reactions
        if (extra) {
            const merged = new Map(message.reactions.map((reaction) => [reactionAuthor(reaction), reaction]))
            for (const [author, reaction] of extra) merged.set(author, reaction)
            list = [...merged.values()].filter((item) => item.emoji)
        }
        if (edited === undefined && !extra) return message
        return { ...message, ...(edited !== undefined ? { text: edited, edited: true } : {}), reactions: list }
    })
}

/** Mensagens de uma página da Evolution (mais antigas primeiro), com os efeitos da própria página aplicados. */
export function buildChatMessages(records: readonly EvolutionMessage[]): ChatMessageDto[] {
    return buildChatPage(records).items
}

/** Página: mensagens com os efeitos aplicados e os efeitos cujo alvo está em outra página. */
export function buildChatPage(records: readonly EvolutionMessage[]): { items: ChatMessageDto[]; orphanEffects: ChatEffects } {
    const { messages, effects } = splitRecords(records)
    const ids = new Set(messages.map((message) => message.id))
    const orphanEffects: ChatEffects = {
        reactions: effects.reactions.filter((item) => !ids.has(item.targetId)),
        edits: effects.edits.filter((item) => !ids.has(item.targetId)),
        revoked: effects.revoked.filter((id) => !ids.has(id)),
    }
    return { items: applyChatEffects(messages, effects), orphanEffects }
}

/** Texto curto de uma mensagem (prévia da citação ao responder). */
export function chatMessagePreview(message: Pick<ChatMessageDto, "kind" | "text" | "media" | "location" | "contacts">): string {
    if (message.text) return message.text
    if (message.media) return message.media.voice ? "Mensagem de voz" : MEDIA_LABELS[message.media.kind]
    if (message.kind === "location") return message.location?.name ?? "Localização"
    if (message.kind === "contact") return message.contacts[0]?.name ?? "Contato"
    if (message.kind === "deleted") return "Mensagem apagada"
    return "Mensagem"
}
