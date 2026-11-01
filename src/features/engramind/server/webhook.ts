import { createHmac, timingSafeEqual } from "node:crypto"
import { listOfChannel } from "@/features/ai/agents"
import { AI_MEMORIES_UPDATED_EVENT } from "@/features/ai/constants"
import { integrationChannel } from "@/lib/pusher/channel-names"
import { publishToChannels } from "@/lib/pusher/channels"
import { getIntegrationConfig } from "@/lib/integrations/config"
import { ENGRAMIND_INTEGRATION_ID, WEBHOOK_TOLERANCE_SECONDS } from "../constants"
import type { EngramindWebhookEvent as WebhookEvent } from "../types"
import { EngramindWebhookEvent, engramindDb } from "./models"
import { engramindLog, publishEngramind } from "./shared"

/**
 * Webhook do Engramind (`POST /api/engramind/webhook`): fora do login, autenticado só pela
 * assinatura `Engramind-Signature: t=<unix>,v1=<hex(HMAC-SHA256(segredo, t + "." + corpo))>`.
 */

export type SignatureCheck = { ok: true } | { ok: false; reason: "missing" | "malformed" | "expired" | "mismatch" }

export function parseSignatureHeader(header: string | null): { t: number; v1: string[] } | null {
    if (!header) return null
    let t: number | null = null
    const v1: string[] = []
    for (const part of header.split(",")) {
        const [key, ...rest] = part.trim().split("=")
        const value = rest.join("=")
        if (key === "t" && /^\d+$/.test(value)) t = Number(value)
        if (key === "v1" && /^[0-9a-fA-F]+$/.test(value)) v1.push(value.toLowerCase())
    }
    return t !== null && v1.length ? { t, v1 } : null
}

export function signPayload(secret: string, t: number, rawBody: string): string {
    return createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex")
}

/** Confere a janela de 5 minutos e o HMAC do corpo bruto em tempo constante (pura; `nowSeconds` injetável). */
export function verifySignature(rawBody: string, header: string | null, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): SignatureCheck {
    if (!header) return { ok: false, reason: "missing" }
    const parsed = parseSignatureHeader(header)
    if (!parsed) return { ok: false, reason: "malformed" }
    if (Math.abs(nowSeconds - parsed.t) > WEBHOOK_TOLERANCE_SECONDS) return { ok: false, reason: "expired" }
    const expected = Buffer.from(signPayload(secret, parsed.t, rawBody), "hex")
    const matches = parsed.v1.some((candidate) => {
        const received = Buffer.from(candidate, "hex")
        return received.length === expected.length && timingSafeEqual(received, expected)
    })
    return matches ? { ok: true } : { ok: false, reason: "mismatch" }
}

/** Primeira vez que o id chega? (o índice único decide; retentativas repetem o mesmo id). */
export async function markEventSeen(id: string, type: string): Promise<boolean> {
    await engramindDb()
    try {
        await EngramindWebhookEvent.create({ _id: id, type, receivedAt: new Date() })
        return true
    } catch (error) {
        if ((error as { code?: number }).code === 11000) return false
        throw error
    }
}

export type WebhookOutcome = { status: 204 } | { status: 401; reason: string }

/** Valida a requisição; o repasse às telas vem depois (`processWebhookEvent`, em `runAfterResponse`). */
export async function authenticateWebhook(rawBody: string, header: string | null): Promise<{ ok: true; event: WebhookEvent } | { ok: false; reason: string }> {
    const config = await getIntegrationConfig(ENGRAMIND_INTEGRATION_ID)
    if (!config.webhookSecret) return { ok: false, reason: "sem segredo configurado" }
    const check = verifySignature(rawBody, header, config.webhookSecret)
    if (!check.ok) return { ok: false, reason: check.reason }
    let event: WebhookEvent
    try {
        event = JSON.parse(rawBody) as WebhookEvent
    } catch {
        return { ok: false, reason: "corpo inválido" }
    }
    if (typeof event?.id !== "string" || typeof event.type !== "string") return { ok: false, reason: "evento sem id ou tipo" }
    return { ok: true, event }
}

/** Descarta id repetido e repassa `engramind-updated` (sem textos nem valores). */
export async function processWebhookEvent(event: WebhookEvent): Promise<boolean> {
    if (!(await markEventSeen(event.id, event.type))) {
        engramindLog.info({ eventId: event.id, type: event.type }, "[engramind] webhook repetido descartado")
        return false
    }
    await publishEngramind({ type: event.type, channel: event.channel ?? null, keys: Array.isArray(event.keys) ? event.keys.slice(0, 50) : undefined })
    await publishMemoryList(event)
    return true
}

/**
 * Memórias dos agentes (OPE-104): `memory.*` num canal mapeado também publica `ai-memories-updated`
 * `{ agentId, centralId?, clientId? }` (os cards relêem sem recarregar). Canal fora do mapeamento é ignorado.
 */
export async function publishMemoryList(event: Pick<WebhookEvent, "type" | "channel">): Promise<boolean> {
    if (!event.type.startsWith("memory.")) return false
    const list = listOfChannel(event.channel)
    if (!list) {
        engramindLog.debug({ type: event.type, channel: event.channel }, "[engramind] memória num canal fora das listas dos agentes: ignorada pelos cards")
        return false
    }
    await publishToChannels([integrationChannel("ai")], AI_MEMORIES_UPDATED_EVENT, { agentId: list.agentId, ...(list.centralId ? { centralId: list.centralId } : {}), ...(list.clientId ? { clientId: list.clientId } : {}) }).catch(() => undefined)
    return true
}
