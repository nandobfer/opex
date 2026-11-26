import { differenceInCalendarDays, format, isToday, isYesterday, startOfDay } from "date-fns"
import { applyChatEffects, type ChatEffects, type ChatMessageDto } from "@/features/evolution-api/chat-message"
import type { ConversationAgentState } from "./constants"
import type { ChatTimelinePageDto, SecretaryConversationDto, TimelineDecisionDto } from "./types"

/**
 * Linha do tempo e lista da aba Conversas (OPE-197, molde do Atendimento do Zaturno CRM). Módulo PURO: junta as
 * páginas (mais novas primeiro) sem repetir mensagens nem decisões, monta divisores de data, cauda do primeiro balão
 * da sequência, pílulas de decisão (D3) e filtra a lista.
 */

export const TEMP_ID_PREFIX = "temp-"
export const isTempId = (id: string) => id.startsWith(TEMP_ID_PREFIX)

export interface MergedTimeline {
    messages: ChatMessageDto[]
    decisions: TimelineDecisionDto[]
    agentIds: Set<string>
}

export function mergeTimelinePages(pages: readonly ChatTimelinePageDto[] | undefined): MergedTimeline {
    const messages = new Map<string, ChatMessageDto>()
    const decisions = new Map<string, TimelineDecisionDto>()
    const agentIds = new Set<string>()
    const effects: ChatEffects = { reactions: [], edits: [], revoked: [] }
    // A página mais recente prevalece (reações e status mais novos).
    for (const page of [...(pages ?? [])].reverse()) {
        for (const item of page.items) messages.set(item.id, item)
        for (const decision of page.decisions) decisions.set(decision.id, decision)
        for (const id of page.agentMessageIds) agentIds.add(id)
        // Reação, edição ou apagar numa página e o alvo em outra: reaplicados aqui.
        effects.reactions.push(...(page.effects?.reactions ?? []))
        effects.edits.push(...(page.effects?.edits ?? []))
        effects.revoked.push(...(page.effects?.revoked ?? []))
    }
    const byTime = <T extends { timestamp?: string; at?: string }>(a: T, b: T) => (a.timestamp ?? a.at ?? "").localeCompare(b.timestamp ?? b.at ?? "")
    return { messages: applyChatEffects([...messages.values()].sort(byTime), effects), decisions: [...decisions.values()].sort(byTime), agentIds }
}

/** Rótulo do divisor de data do WhatsApp: "Hoje", "Ontem" ou dd/mm/aaaa. */
export function dayLabel(value: Date | string, now = new Date()): string {
    const diff = differenceInCalendarDays(startOfDay(now), startOfDay(new Date(value)))
    if (diff === 0) return "Hoje"
    if (diff === 1) return "Ontem"
    return format(new Date(value), "dd/MM/yyyy")
}

/** Horário da lista no padrão do WhatsApp: hora (hoje), "Ontem" ou dd/mm/aaaa. */
export function listTime(value: string | null | undefined): string {
    if (!value) return ""
    const date = new Date(value)
    if (isToday(date)) return format(date, "HH:mm")
    if (isYesterday(date)) return "Ontem"
    return format(date, "dd/MM/yyyy")
}

/** `m:ss` de uma duração em segundos. */
export function formatDuration(seconds: number | null | undefined): string {
    const total = Math.max(0, Math.round(seconds ?? 0))
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`
}

/**
 * Autor de uma citação: o contato quando o número é o da conversa; em grupo, o número do participante; senão, o dono
 * ("Você"). `chatId` de conversa individual são os dígitos do contato (`conversationIdOfJid`).
 */
export function quotedAuthorLabel(author: string | null, chatId: string, contactName: string, isGroup: boolean): string {
    const digits = author?.split("@")[0]?.split(":")[0] ?? null
    if (!digits) return isGroup ? "Participante" : contactName
    if (!isGroup) return digits === chatId ? contactName : "Você"
    return digits
}

export type TimelineRow =
    | { type: "divider"; key: string; label: string }
    | { type: "message"; key: string; message: ChatMessageDto; firstOfSequence: boolean; fromAgent: boolean }
    | { type: "decision"; key: string; decision: TimelineDecisionDto }

/** Linhas prontas: divisores por dia, cauda só no primeiro balão do mesmo lado e as pílulas na hora da decisão. */
export function buildTimelineRows(messages: readonly ChatMessageDto[], decisions: readonly TimelineDecisionDto[], agentIds: ReadonlySet<string>, now = new Date()): TimelineRow[] {
    type Item = { at: string; message?: ChatMessageDto; decision?: TimelineDecisionDto }
    const items: Item[] = [...messages.map((message) => ({ at: message.timestamp, message })), ...decisions.map((decision) => ({ at: decision.at, decision }))]
    items.sort((a, b) => a.at.localeCompare(b.at))
    const rows: TimelineRow[] = []
    let lastDay: string | null = null
    let previousSide: boolean | null = null
    for (const item of items) {
        const day = format(new Date(item.at), "yyyy-MM-dd")
        if (day !== lastDay) {
            rows.push({ type: "divider", key: `d-${day}`, label: dayLabel(item.at, now) })
            lastDay = day
            previousSide = null
        }
        if (item.decision) {
            rows.push({ type: "decision", key: `e-${item.decision.id}`, decision: item.decision })
            previousSide = null
            continue
        }
        const message = item.message!
        rows.push({ type: "message", key: `m-${message.id}`, message, firstOfSequence: previousSide !== message.fromMe, fromAgent: agentIds.has(message.id) })
        previousSide = message.fromMe
    }
    return rows
}

export const CONVERSATION_FILTERS = ["todas", "nao_lidas"] as const
export type ConversationFilter = (typeof CONVERSATION_FILTERS)[number]
export const CONVERSATION_FILTER_LABELS: Record<ConversationFilter, string> = { todas: "Todas", nao_lidas: "Não lidas" }

/** Chips Todas/Não lidas e o filtro do estado do Secretário (equivalente ao "Com o agente" do Atendimento). */
export function filterConversations<T extends Pick<SecretaryConversationDto, "unreadCount" | "state">>(rows: readonly T[], filter: ConversationFilter, states: readonly ConversationAgentState[]): T[] {
    return rows.filter((row) => (filter === "nao_lidas" ? (row.unreadCount ?? 0) > 0 : true) && (states.length === 0 || states.includes(row.state)))
}

const DOCUMENT_KINDS: Array<{ test: RegExp; label: string }> = [
    { test: /pdf/, label: "PDF" },
    { test: /word|msword|\.docx?$/, label: "DOC" },
    { test: /sheet|excel|csv|\.xlsx?$/, label: "XLS" },
    { test: /presentation|powerpoint|\.pptx?$/, label: "PPT" },
    { test: /text\/plain|\.txt$/, label: "TXT" },
]

/** Rótulo curto do documento (padrão do WhatsApp). */
export function documentLabel(fileName: string | null | undefined, mimeType: string | null | undefined): string {
    const haystack = `${mimeType ?? ""} ${fileName?.toLowerCase() ?? ""}`
    const found = DOCUMENT_KINDS.find((kind) => kind.test.test(haystack))
    if (found) return found.label
    const extension = fileName?.split(".").pop()
    return extension && extension !== fileName ? extension.toUpperCase().slice(0, 4) : "ARQ"
}

/**
 * `src` de uma mídia da conversa. `<img>`/`<audio>` não usam o axios: o caminho leva `/api` (e o subcaminho do app,
 * por `withBasePath` em quem chama).
 */
export function chatMediaPath(chatId: string, messageId: string, attempt = 0): string {
    return `/api/secretary/conversations/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}/media${attempt ? `?t=${attempt}` : ""}`
}

/** Coordenadas de "lat, lng" ou de um link do Google Maps (`@lat,lng` ou `q=lat,lng`). */
export function parseCoordinates(value: string): { latitude: number; longitude: number } | null {
    const match = /(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/.exec(value.replace(/%2C/gi, ","))
    if (!match) return null
    const latitude = Number(match[1])
    const longitude = Number(match[2])
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null
    return { latitude, longitude }
}
