import { createHash } from "node:crypto"
import type { MemoryConsumer, RoutineIdentity } from "@/features/ai/agents"
import type { ContextView } from "../types"
import { engramindCall, type EngramindTarget } from "./client"
import { agentTarget } from "./memory-network"
import { ENGRAMIND_STATE_ID, EngramindContextCache, EngramindState, engramindDb } from "./models"
import { engramindLog, publishEngramind } from "./shared"
import { engramindCodeOf } from "./errors"
import { deliveredChannels, parseTaggedContext } from "../context-tagged"

/**
 * Contexto das memórias de um agente (OPE-104): o bloco pronto do Engramind (`GET /v1/context`,
 * `format=tagged`, que traz o id de cada memória), pedido com o token do agente e restrito aos canais
 * do turno. Cada resposta boa vira o cache daquele agente + combinação de canais (com os ids
 * entregues); com o Engramind fora do ar, token inválido ou sem configuração, o turno usa o último
 * bloco em cache (ou roda sem memórias). **Nunca lança.**
 *
 * Consumo ao vivo (OPE-109): resposta boa (`200` ou `304`) com memórias publica
 * `engramind-consumption` (só ids); cache por indisponibilidade ou turno sem memórias não publica.
 *
 * Foco (OPE-117, Engramind 0.11.0): `focus` vai na query do `GET /v1/context`. Um Engramind sem
 * suporte (400 de validação) recebe de novo sem foco; bloco degradado (`focus_mode` `text`/`none`)
 * não entra em cache. A última entrega por consumidor vai para `engramind_deliveries` (só ids).
 */

const CONTEXT_TIMEOUT_MS = 5_000
const CONTEXT_FORMAT = "tagged"

export type FocusMode = "hybrid" | "text" | "none"

export interface MemoryContextResult {
    block: string
    source: "live" | "cache" | "none"
    /** Data do bloco usado (ISO): a da última resposta boa. */
    cachedAt: string | null
    counts: { full: number; titles: number; overflow: number }
    /** Motivo da indisponibilidade (sem segredos). */
    reason: string | null
    /** Como o foco foi aplicado (`null` = turno sem foco ou Engramind sem suporte). */
    focusMode?: FocusMode | null
}

export interface MemoryContextOptions {
    /** Foco do turno (já sem segredos e cortado: `buildMemoryFocus`). Nunca vai para log, cache ou evento. */
    focus?: string
    /** Alvo com o token do agente (agentes rotineiros guardam o próprio token, OPE-130). */
    target?: EngramindTarget
}

/** Quem lê o contexto: um consumidor fixo ou um agente rotineiro (`rotineiro-<slug>`). */
export type ContextConsumer = MemoryConsumer | RoutineIdentity

export const contextCacheKey = (consumer: ContextConsumer, channels: readonly string[]) => createHash("sha256").update(`${consumer}|${[...channels].sort().join(",")}`).digest("hex")

/** Hash do foco normalizado (o texto nunca é gravado). */
export const focusHashOf = (focus: string | undefined) => (focus ? createHash("sha256").update(focus.replace(/\s+/g, " ").trim()).digest("hex") : null)

const EMPTY_COUNTS = { full: 0, titles: 0, overflow: 0 }

/** Engramind anterior à 0.11.0 (ou foco recusado): refaz uma vez sem o foco. */
const isFocusRejection = (error: unknown) => {
    const code = engramindCodeOf(error)
    return code === "FOCUS_TOO_LONG" || code === "VALIDATION_ERROR" || code === "UNKNOWN_FIELD" || code === "INVALID_QUERY"
}

interface DeliveryMeta {
    titleIds: readonly string[]
    version: string
    counts: { full: number; titles: number; overflow: number }
    focusMode: FocusMode | null
    source: "live" | "not-modified"
}

/**
 * Última entrega do contexto por agente (aba Engramind e adoção, OPE-117), fora do caminho do turno: não
 * atrasa a resposta nem lança. O consumo ao vivo da rede vem do webhook `memory.consumed` do Engramind
 * (OPE-116), emitido pelo próprio `get_context` com o token do agente (inclusive o `304`).
 */
function recordContextDelivery(consumer: ContextConsumer, channels: readonly string[], memoryIds: readonly string[], delivered: readonly string[], meta: DeliveryMeta): void {
    void import("./deliveries")
        .then(({ recordDelivery }) => recordDelivery(consumer, { fullIds: memoryIds, titleIds: meta.titleIds, counts: meta.counts, channels, delivered, version: meta.version, focusMode: meta.focusMode, source: meta.source }))
        .catch((error: unknown) => engramindLog.warn({ err: error instanceof Error ? error.message : String(error), consumer }, "[engramind] última entrega do contexto não registrada"))
}

/** Registra a saúde do contexto; publica quando muda (cards e aba Engramind mostram o aviso). */
async function markHealth(ok: boolean, reason: string | null): Promise<void> {
    const state = await EngramindState.findById(ENGRAMIND_STATE_ID).select({ memoryContext: 1 }).lean()
    const wasUnavailable = Boolean(state?.memoryContext?.unavailableSince)
    const now = new Date()
    const next = ok ? { lastOkAt: now, unavailableSince: null, lastError: null } : { lastOkAt: state?.memoryContext?.lastOkAt ?? null, unavailableSince: state?.memoryContext?.unavailableSince ?? now, lastError: reason }
    await EngramindState.updateOne({ _id: ENGRAMIND_STATE_ID }, { $set: { memoryContext: next } }, { upsert: true })
    if (wasUnavailable === ok) await publishEngramind({ type: "memories.context" }).catch(() => undefined)
}

export async function getAgentMemoryContext(consumer: ContextConsumer, channels: readonly string[], options: MemoryContextOptions = {}): Promise<MemoryContextResult> {
    let cached: Awaited<ReturnType<typeof readCache>> = null
    try {
        await engramindDb()
        cached = await readCache(consumer, channels)
    } catch (error) {
        engramindLog.warn({ err: error instanceof Error ? error.message : String(error), consumer }, "[engramind] não foi possível ler o cache do contexto das memórias")
    }
    try {
        const target = options.target ?? (consumer.startsWith("rotineiro-") ? null : await agentTarget(consumer as MemoryConsumer))
        if (!target) throw new Error("token do agente de memórias indisponível (confira canais e agentes na aba Migração de memórias)")
        let focus = options.focus?.trim() ? options.focus : undefined
        const fetchContext = async (withFocus: string | undefined) => {
            const hash = focusHashOf(withFocus)
            // Cache de outro formato (markdown, antes da OPE-109) ou de outro foco tem outra `version`: relê o bloco.
            const reuse = cached?.version && cached.format === CONTEXT_FORMAT && (cached.focusHash ?? null) === hash
            return engramindCall<ContextView | null>(
                "GET",
                { path: "/v1/context", query: { channels: channels.join(","), format: CONTEXT_FORMAT, focus: withFocus } },
                { target, timeoutMs: CONTEXT_TIMEOUT_MS, headers: reuse ? { "If-None-Match": cached!.version } : undefined },
            )
        }
        let view: ContextView | null
        try {
            view = await fetchContext(focus)
        } catch (error) {
            if (!focus || !isFocusRejection(error)) throw error
            engramindLog.info({ consumer, focus_fallback: true, focus_len: focus.length }, "[engramind] foco recusado pelo Engramind: contexto pedido sem foco")
            focus = undefined
            view = await fetchContext(undefined)
        }
        const now = new Date()
        if (view === null && cached) {
            await EngramindContextCache.updateOne({ _id: cached._id }, { $set: { fetchedAt: now } })
            await markHealth(true, null)
            const counts = cached.counts ?? EMPTY_COUNTS
            const focusMode = focus ? (cached.focusMode ?? null) : null
            recordContextDelivery(consumer, channels, cached.memoryIds ?? [], cached.delivered ?? [], { titleIds: cached.titleIds ?? [], version: cached.version, counts, focusMode, source: "not-modified" })
            return { block: cached.content, source: "live", cachedAt: now.toISOString(), counts, reason: null, focusMode }
        }
        if (!view) throw new Error("o Engramind respondeu sem o contexto")
        const content = typeof view.content === "string" ? view.content : ""
        const counts = view.counts ?? EMPTY_COUNTS
        const focusMode: FocusMode | null = focus ? (view.focus_mode ?? null) : null
        const ids = parseTaggedContext(content)
        const memoryIds = ids.full.map((item) => item.id)
        const delivered = deliveredChannels(ids)
        const version = view.version ?? ""
        // Bloco com foco degradado (`text`/`none`) tem outra `version` e não entra no cache (decisão 0029).
        if (focusMode !== "text" && focusMode !== "none") {
            await EngramindContextCache.updateOne(
                { _id: contextCacheKey(consumer, channels) },
                { $set: { consumer, channels: [...channels], content, version, counts, format: CONTEXT_FORMAT, memoryIds, titleIds: ids.titles, delivered, focusHash: focusHashOf(focus), focusMode, fetchedAt: now } },
                { upsert: true },
            )
        }
        await markHealth(true, null)
        recordContextDelivery(consumer, channels, memoryIds, delivered, { titleIds: ids.titles, version, counts, focusMode, source: "live" })
        return { block: content, source: "live", cachedAt: now.toISOString(), counts, reason: null, focusMode }
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        engramindLog.warn({ consumer, channels, err: reason, cache: Boolean(cached) }, "[engramind] contexto das memórias indisponível: o turno usa o cache")
        await markHealth(false, reason).catch(() => undefined)
        if (cached) return { block: cached.content, source: "cache", cachedAt: new Date(cached.fetchedAt).toISOString(), counts: cached.counts ?? EMPTY_COUNTS, reason, focusMode: null }
        return { block: "", source: "none", cachedAt: null, counts: EMPTY_COUNTS, reason, focusMode: null }
    }
}

async function readCache(consumer: ContextConsumer, channels: readonly string[]) {
    return EngramindContextCache.findById(contextCacheKey(consumer, channels)).lean()
}

/** Estado do contexto para a tela (aviso "Engramind indisponível: agentes usando o contexto de …"). */
export async function memoryContextHealth(): Promise<{ unavailable: boolean; since: string | null; lastOkAt: string | null; reason: string | null }> {
    await engramindDb()
    const state = await EngramindState.findById(ENGRAMIND_STATE_ID).select({ memoryContext: 1 }).lean()
    const health = state?.memoryContext
    return {
        unavailable: Boolean(health?.unavailableSince),
        since: health?.unavailableSince ? new Date(health.unavailableSince).toISOString() : null,
        lastOkAt: health?.lastOkAt ? new Date(health.lastOkAt).toISOString() : null,
        reason: health?.lastError ?? null,
    }
}

/** Fora do contexto por combinação (dos caches mais recentes): faixa de títulos + overflow. */
export async function memoryContextOverflow(): Promise<{ consumer: string; channels: string[]; outside: number; titles: number; fetchedAt: string }[]> {
    await engramindDb()
    const rows = await EngramindContextCache.find({}).lean()
    return rows
        .map((row) => ({ consumer: row.consumer, channels: row.channels, outside: row.counts?.overflow ?? 0, titles: row.counts?.titles ?? 0, fetchedAt: new Date(row.fetchedAt).toISOString() }))
        .filter((row) => row.outside > 0 || row.titles > 0)
}
