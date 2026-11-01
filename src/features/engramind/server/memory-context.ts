import { createHash } from "node:crypto"
import type { MemoryConsumer } from "@/features/ai/agents"
import type { ContextView } from "../types"
import { engramindCall } from "./client"
import { agentTarget } from "./memory-network"
import { ENGRAMIND_STATE_ID, EngramindContextCache, EngramindState, engramindDb } from "./models"
import { engramindLog, publishEngramind } from "./shared"
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
 */

const CONTEXT_TIMEOUT_MS = 5_000
const CONTEXT_FORMAT = "tagged"

export interface MemoryContextResult {
    block: string
    source: "live" | "cache" | "none"
    /** Data do bloco usado (ISO): a da última resposta boa. */
    cachedAt: string | null
    counts: { full: number; titles: number; overflow: number }
    /** Motivo da indisponibilidade (sem segredos). */
    reason: string | null
}

export const contextCacheKey = (consumer: MemoryConsumer, channels: readonly string[]) => createHash("sha256").update(`${consumer}|${[...channels].sort().join(",")}`).digest("hex")

const EMPTY_COUNTS = { full: 0, titles: 0, overflow: 0 }

/** Fora do caminho do turno: não atrasa a resposta do agente nem lança. */
async function publishContextConsumption(consumer: MemoryConsumer, channels: readonly string[], memoryIds: readonly string[], delivered: readonly string[]): Promise<void> {
    if (!memoryIds.length) {
        engramindLog.info({ consumer, channels }, "[engramind] turno sem memórias entregues: consumo não publicado")
        return
    }
    try {
        const { publishConsumption } = await import("./consumption")
        await publishConsumption({ agent: `opex/${consumer}`, kind: "context", channels: [...channels], delivered: [...delivered], memoryIds: [...memoryIds] })
    } catch (error) {
        engramindLog.warn({ err: error instanceof Error ? error.message : String(error), consumer }, "[engramind] consumo do contexto não publicado")
    }
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

export async function getAgentMemoryContext(consumer: MemoryConsumer, channels: readonly string[]): Promise<MemoryContextResult> {
    let cached: Awaited<ReturnType<typeof readCache>> = null
    try {
        await engramindDb()
        cached = await readCache(consumer, channels)
    } catch (error) {
        engramindLog.warn({ err: error instanceof Error ? error.message : String(error), consumer }, "[engramind] não foi possível ler o cache do contexto das memórias")
    }
    try {
        const target = await agentTarget(consumer)
        if (!target) throw new Error("token do agente de memórias indisponível (confira canais e agentes na aba Migração de memórias)")
        const view = await engramindCall<ContextView | null>(
            "GET",
            { path: "/v1/context", query: { channels: channels.join(","), format: CONTEXT_FORMAT } },
            // Cache de outro formato (markdown, antes da OPE-109) tem outra `version`: relê o bloco.
            { target, timeoutMs: CONTEXT_TIMEOUT_MS, headers: cached?.version && cached.format === CONTEXT_FORMAT ? { "If-None-Match": cached.version } : undefined },
        )
        const now = new Date()
        if (view === null && cached) {
            await EngramindContextCache.updateOne({ _id: cached._id }, { $set: { fetchedAt: now } })
            await markHealth(true, null)
            void publishContextConsumption(consumer, channels, cached.memoryIds ?? [], cached.delivered ?? [])
            return { block: cached.content, source: "live", cachedAt: now.toISOString(), counts: cached.counts ?? EMPTY_COUNTS, reason: null }
        }
        if (!view) throw new Error("o Engramind respondeu sem o contexto")
        const content = typeof view.content === "string" ? view.content : ""
        const counts = view.counts ?? EMPTY_COUNTS
        const ids = parseTaggedContext(content)
        const memoryIds = ids.full.map((item) => item.id)
        const delivered = deliveredChannels(ids)
        await EngramindContextCache.updateOne(
            { _id: contextCacheKey(consumer, channels) },
            { $set: { consumer, channels: [...channels], content, version: view.version ?? "", counts, format: CONTEXT_FORMAT, memoryIds, delivered, fetchedAt: now } },
            { upsert: true },
        )
        await markHealth(true, null)
        void publishContextConsumption(consumer, channels, memoryIds, delivered)
        return { block: content, source: "live", cachedAt: now.toISOString(), counts, reason: null }
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        engramindLog.warn({ consumer, channels, err: reason, cache: Boolean(cached) }, "[engramind] contexto das memórias indisponível: o turno usa o cache")
        await markHealth(false, reason).catch(() => undefined)
        if (cached) return { block: cached.content, source: "cache", cachedAt: new Date(cached.fetchedAt).toISOString(), counts: cached.counts ?? EMPTY_COUNTS, reason }
        return { block: "", source: "none", cachedAt: null, counts: EMPTY_COUNTS, reason }
    }
}

async function readCache(consumer: MemoryConsumer, channels: readonly string[]) {
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
