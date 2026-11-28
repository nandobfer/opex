
import { createHash, timingSafeEqual } from "node:crypto"
import { evolutionWebhookBodySchema, type EvolutionMessage, type EvolutionWebhookBody } from "../evolution-dto"
import { isGroupJid, LID_JID_SUFFIX, normalizeJid } from "../constants"
import { lidAliasOf, messageDisplayText, parseEvolutionMessage, type ParsedMessage } from "../message"
import { chatJidsOfUpdate, connectionOf, contactsOf, filledProfileFields, messagesOf, normalizeEventName, qrOf, type ContactUpdate } from "../webhook-parse"
import { evolutionConfig, patchState } from "./instances"
import { rememberLidAliases, resolveKnownLid } from "./lid"
import { contactKey, EvolutionContact, EvolutionInstanceState, EvolutionSeenEvent, evolutionDb } from "./models"
import { evolutionLog, publishEvolution } from "./shared"

/**
 * Webhook de entrada da Evolution (`POST /api/evolution/webhook`): autenticado SÓ pelo header com o
 * segredo (`x-opex-webhook-secret`); mensagem repetida (mesmo id) é descartada; instância desconhecida é
 * ignorada e logada. O `apikey` que a Evolution manda no corpo nunca é logado nem gravado.
 */

export type WebhookAuth = { ok: true; body: EvolutionWebhookBody } | { ok: false; status: 400 | 401; reason: string }

const digest = (value: string) => createHash("sha256").update(value).digest()

export function secretMatches(received: string | null, expected: string | null | undefined): boolean {
    if (!received || !expected) return false
    return timingSafeEqual(digest(received), digest(expected))
}

export async function authenticateEvolutionWebhook(raw: string, secretHeader: string | null): Promise<WebhookAuth> {
    const config = await evolutionConfig()
    if (!secretMatches(secretHeader, config.webhookSecret)) return { ok: false, status: 401, reason: "segredo ausente ou inválido" }
    let json: unknown
    try {
        json = JSON.parse(raw)
    } catch {
        return { ok: false, status: 400, reason: "corpo não é JSON" }
    }
    const parsed = evolutionWebhookBodySchema.safeParse(json)
    if (!parsed.success) return { ok: false, status: 400, reason: "corpo fora do formato da Evolution" }
    return { ok: true, body: parsed.data }
}

/** Marca o id como visto; `false` se já tinha chegado (repetição). */
export async function markSeen(id: string): Promise<boolean> {
    await evolutionDb()
    try {
        await EvolutionSeenEvent.create({ _id: id, receivedAt: new Date() })
        return true
    } catch (error) {
        if ((error as { code?: number }).code === 11000) return false
        throw error
    }
}

async function isKnownInstance(name: string): Promise<boolean> {
    const config = await evolutionConfig()
    if (config.defaultInstance?.trim() === name) return true
    await evolutionDb()
    return (await EvolutionInstanceState.exists({ _id: name })) !== null
}

export async function upsertContacts(instance: string, contacts: ContactUpdate[], options: { hasChat?: boolean; lastMessageAt?: Date } = {}): Promise<void> {
    if (contacts.length === 0) return
    await evolutionDb()
    await EvolutionContact.bulkWrite(
        contacts.map((contact) => {
            const $set: Record<string, unknown> = { updatedAt: new Date(), isGroup: contact.isGroup }
            if (contact.name) $set.name = contact.name
            if (contact.pushName) $set.pushName = contact.pushName
            if (contact.pictureUrl) $set.pictureUrl = contact.pictureUrl
            if (options.hasChat) $set.hasChat = true
            if (options.lastMessageAt) $set.lastMessageAt = options.lastMessageAt
            if (typeof contact.unreadCount === "number") $set.unreadCount = contact.unreadCount
            return {
                updateOne: {
                    filter: { _id: contactKey(instance, contact.jid) },
                    update: { $set, $setOnInsert: { instance, jid: contact.jid } },
                    upsert: true,
                },
            }
        }),
        { ordered: false },
    )
}

/** Prévia da lista (até 200 caracteres). */
export const LAST_MESSAGE_PREVIEW_MAX = 200

/**
 * Prévia e não lidas da conversa (aba Conversas do Secretário, OPE-197): recebida soma 1 (fora da conversa consigo
 * mesmo); `fromMe` zera, como o WhatsApp faz ao responder. Reação e protocolo não mexem na prévia.
 */
export async function recordChatActivity(instance: string, message: ParsedMessage, ownerJid: string | null): Promise<void> {
    if (message.ignorable) return
    const lastMessage = { text: messageDisplayText(message).slice(0, LAST_MESSAGE_PREVIEW_MAX), kind: message.media?.kind ?? "text", fromMe: message.fromMe }
    const self = ownerJid !== null && normalizeJid(ownerJid) === message.chatJid
    const update = message.fromMe ? { $set: { lastMessage, unreadCount: 0 } } : self ? { $set: { lastMessage } } : { $set: { lastMessage }, $inc: { unreadCount: 1 } }
    await EvolutionContact.updateOne({ _id: contactKey(instance, message.chatJid) }, update)
}

/** Avisa a aba Conversas do Secretário (import sob demanda, como o turno). */
async function notifySecretaryChats(instance: string, jids: string[]): Promise<void> {
    if (jids.length === 0) return
    const { publishSecretaryChatUpdated } = await import("@/features/secretary-agent/server/chat-events")
    await publishSecretaryChatUpdated(instance, jids)
}

let lastContactsPublish = 0
async function publishContactsThrottled(instance: string): Promise<void> {
    const now = Date.now()
    if (now - lastContactsPublish < 5_000) return
    lastContactsPublish = now
    await publishEvolution("contacts", instance)
}

/**
 * LID do dono: numa mensagem dele (`fromMe`) num grupo com endereçamento por LID, o autor (`participant`) é o
 * `<lid>@lid` do próprio dono. Serve para reconhecer menções e citações por LID ("só quando mencionado").
 */
export function ownerLidOf(raw: EvolutionMessage): string | null {
    if (!raw.key.fromMe || !isGroupJid(raw.key.remoteJid)) return null
    const participant = raw.key.participant ? normalizeJid(raw.key.participant) : null
    return participant?.endsWith(LID_JID_SUFFIX) ? participant : null
}

/**
 * Endereçamento por LID (OPE-207): mensagem `@lid` com `remoteJidAlt` ensina a correspondência; `@lid` sem
 * `remoteJidAlt` (ex.: resposta do dono pelo celular) cai na conversa do número quando ela já é conhecida.
 */
export async function withKnownLid(instance: string, raw: EvolutionMessage, parsed: ParsedMessage): Promise<ParsedMessage> {
    const alias = lidAliasOf(raw.key)
    if (alias) {
        await rememberLidAliases(instance, [alias])
        return parsed
    }
    if (!parsed.chatJid.endsWith(LID_JID_SUFFIX)) return parsed
    const chatJid = await resolveKnownLid(instance, parsed.chatJid)
    return chatJid === parsed.chatJid ? parsed : { ...parsed, chatJid }
}

/** Repassa a mensagem ao Agente Secretário (import sob demanda: o turno puxa a SDK de IA). */
async function forwardToSecretary(instance: string, message: ParsedMessage): Promise<void> {
    const { handleIncomingMessage } = await import("@/features/secretary-agent/server/inbound")
    await handleIncomingMessage(instance, message)
}

/** Processa o evento (depois da resposta 204). */
export async function processEvolutionEvent(body: EvolutionWebhookBody): Promise<void> {
    const event = normalizeEventName(body.event)
    const instance = body.instance
    if (!(await isKnownInstance(instance))) {
        evolutionLog.warn({ instance, event }, "[evolution] Evento de instância desconhecida ignorado")
        return
    }
    let ok = true
    let message: string | null = null
    try {
        if (event === "CONNECTION_UPDATE") {
            const update = connectionOf(body.data)
            if (update) {
                await patchState(instance, {
                    state: update.state,
                    ...(update.state === "open" ? { qr: null, qrLimitReached: false, ...filledProfileFields({ ownerJid: update.ownerJid, profileName: update.profileName, profilePictureUrl: update.profilePictureUrl }) } : {}),
                    ...(update.state === "refused" ? { qr: null, qrLimitReached: true } : {}),
                })
                message = `Conexão: ${update.state}`
                await publishEvolution("connection", instance)
            }
        } else if (event === "QRCODE_UPDATED") {
            const qr = qrOf(body.data)
            if (qr?.limitReached) {
                await patchState(instance, { state: "close", qr: null, qrLimitReached: true })
                message = "Limite de QR codes atingido"
            } else if (qr) {
                await evolutionDb()
                const current = await EvolutionInstanceState.findById(instance).lean()
                await patchState(instance, {
                    state: "connecting",
                    qr: {
                        mode: current?.qr?.mode ?? (qr.pairingCode ? "pairing" : "qr"),
                        base64: qr.base64,
                        code: qr.code,
                        pairingCode: qr.pairingCode ?? current?.qr?.pairingCode ?? null,
                        count: (current?.qr?.count ?? 0) + 1,
                        generatedAt: new Date(),
                    },
                })
                message = "QR code renovado"
            }
            await publishEvolution("qrcode", instance)
        } else if (event === "CONTACTS_UPSERT" || event === "CONTACTS_UPDATE") {
            const contacts = contactsOf(body.data)
            await upsertContacts(instance, contacts)
            message = `${contacts.length} contato(s)`
            await publishContactsThrottled(instance)
        } else if (event === "CHATS_UPSERT" || event === "CHATS_UPDATE") {
            const chats = contactsOf(body.data)
            await upsertContacts(instance, chats, { hasChat: true })
            message = `${chats.length} conversa(s)`
            await publishContactsThrottled(instance)
            await notifySecretaryChats(instance, chats.filter((chat) => typeof chat.unreadCount === "number").map((chat) => chat.jid))
        } else if (event === "MESSAGES_UPDATE") {
            const jids = [...new Set(await Promise.all(chatJidsOfUpdate(body.data).map((jid) => resolveKnownLid(instance, jid))))]
            message = `${jids.length} conversa(s) com mensagens atualizadas`
            await notifySecretaryChats(instance, jids)
        } else if (event === "MESSAGES_UPSERT") {
            const messages = messagesOf(body.data)
            let forwarded = 0
            let ownerJid: string | null | undefined
            await Promise.all(messages.map(async (raw) => {
                if (raw.key.remoteJid === "status@broadcast") return
                if (!(await markSeen(`${instance}:${raw.key.id}`))) return
                const parsed = await withKnownLid(instance, raw, parseEvolutionMessage(raw))
                const ownerLid = ownerLidOf(raw)
                if (ownerLid) await patchState(instance, { ownerLid })
                await upsertContacts(
                    instance,
                    [{ jid: parsed.chatJid, name: null, pushName: parsed.fromMe || parsed.isGroup ? null : parsed.pushName, pictureUrl: null, isGroup: parsed.isGroup }],
                    { hasChat: true, lastMessageAt: parsed.timestamp },
                )
                ownerJid ??= (await EvolutionInstanceState.findById(instance).select("ownerJid").lean())?.ownerJid ?? null
                await recordChatActivity(instance, parsed, ownerJid)
                // Antes do turno (que espera o agrupamento): a conversa aberta mostra a mensagem na hora.
                await notifySecretaryChats(instance, [parsed.chatJid])
                await forwardToSecretary(instance, parsed)
                forwarded += 1
            }))
            message = `${forwarded} mensagem(ns) nova(s)`
        } else {
            message = "Evento registrado"
        }
    } catch (error) {
        ok = false
        message = error instanceof Error ? error.message : String(error)
        evolutionLog.error({ err: error, instance, event }, "[evolution] Falha ao processar evento do webhook")
    }
    await patchState(instance, { lastEvent: { at: new Date(), event, ok, message } })
}
