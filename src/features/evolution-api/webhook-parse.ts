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
        })
    }
    return out
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
