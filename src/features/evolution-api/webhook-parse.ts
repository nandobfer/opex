import { isGroupJid, normalizeJid } from "./constants"
import { evolutionMessageSchema, type EvolutionMessage } from "./evolution-dto"

/** Leitura pura dos eventos do webhook da Evolution (nomes e corpos variam entre `messages.upsert` e `MESSAGES_UPSERT`). */

/** `messages.upsert` / `MESSAGES_UPSERT` / `messages-upsert` → `MESSAGES_UPSERT`. */
export function normalizeEventName(event: string): string {
    return event.replace(/[.-]/g, "_").toUpperCase()
}

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : value === null || value === undefined ? [] : [value])

function record(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null)

/** Mensagens de um `MESSAGES_UPSERT` (um objeto ou lista; também aceita `{ messages: [...] }`). */
export function messagesOf(data: unknown): EvolutionMessage[] {
    const inner = record(data)?.messages
    const items = inner !== undefined ? asArray(inner) : asArray(data)
    const out: EvolutionMessage[] = []
    for (const item of items) {
        const parsed = evolutionMessageSchema.safeParse(item)
        if (parsed.success) out.push(parsed.data)
    }
    return out
}

export interface ContactUpdate {
    jid: string
    name: string | null
    pushName: string | null
    pictureUrl: string | null
    isGroup: boolean
    /** Não lidas do WhatsApp (só nos `CHATS_*`: `unreadMessages` ou `unreadCount`); ausente = não veio. */
    unreadCount?: number | null
}

const count = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null)

function unreadOf(row: Record<string, unknown>): { unreadCount?: number } {
    const unread = count(row.unreadMessages) ?? count(row.unreadCount)
    return unread === null ? {} : { unreadCount: unread }
}

/** Contatos/conversas de `CONTACTS_*` e `CHATS_*` (campos `remoteJid` ou `id`). */
export function contactsOf(data: unknown): ContactUpdate[] {
    const out: ContactUpdate[] = []
    for (const item of asArray(data)) {
        const row = record(item)
        if (!row) continue
        const raw = str(row.remoteJid) ?? str(row.id)
        if (!raw || !raw.includes("@") || raw === "status@broadcast") continue
        const jid = normalizeJid(raw)
        out.push({
            jid,
            name: str(row.name) ?? str(row.subject),
            pushName: str(row.pushName) ?? str(row.notify),
            pictureUrl: str(row.profilePicUrl) ?? str(row.profilePictureUrl) ?? str(row.imgUrl),
            isGroup: isGroupJid(jid),
            ...unreadOf(row),
        })
    }
    return out
}

/** Conversas tocadas por um `MESSAGES_UPDATE` (status de entrega/leitura, edição): `remoteJid` ou `key.remoteJid`. */
export function chatJidsOfUpdate(data: unknown): string[] {
    const jids = new Set<string>()
    for (const item of asArray(data)) {
        const row = record(item)
        const raw = str(row?.remoteJid) ?? str(record(row?.key)?.remoteJid)
        if (raw && raw.includes("@") && raw !== "status@broadcast") jids.add(normalizeJid(raw))
    }
    return [...jids]
}

export interface ConnectionUpdate {
    state: string
    ownerJid: string | null
    profileName: string | null
    profilePictureUrl: string | null
}

export function connectionOf(data: unknown): ConnectionUpdate | null {
    const row = record(data)
    const state = str(row?.state)
    if (!row || !state) return null
    return { state, ownerJid: str(row.wuid) ? normalizeJid(String(row.wuid)) : null, profileName: str(row.profileName), profilePictureUrl: str(row.profilePictureUrl) }
}

/**
 * Só os campos de perfil que vieram preenchidos: o `CONNECTION_UPDATE` nem sempre traz o nome e a foto, e gravar
 * `null` apagaria o perfil que o `fetchInstances` já tinha completado.
 */
export function filledProfileFields<T extends Record<string, string | null | undefined>>(fields: T): Partial<Record<keyof T, string>> {
    const out: Partial<Record<keyof T, string>> = {}
    for (const [key, value] of Object.entries(fields)) if (typeof value === "string" && value.trim()) out[key as keyof T] = value
    return out
}

export interface QrUpdate {
    base64: string | null
    code: string | null
    pairingCode: string | null
    limitReached: boolean
}

export function qrOf(data: unknown): QrUpdate | null {
    const row = record(data)
    if (!row) return null
    const qr = record(row.qrcode)
    if (qr) return { base64: str(qr.base64), code: str(qr.code), pairingCode: str(qr.pairingCode), limitReached: false }
    if (typeof row.message === "string" && /limit/i.test(row.message)) return { base64: null, code: null, pairingCode: null, limitReached: true }
    return null
}
