import { DomainError } from "@/lib/api/route"
import { engramindCall } from "./client"
import { ENGRAMIND_STATE_ID, EngramindRelatedMemory, EngramindState, engramindDb, type IEngramindState } from "./models"
import { engramindLog, publishEngramind } from "./shared"
import { RELATED_MEMORIES_EVENT_TYPE } from "../constants"
import type { EngramindMemory, RelatedMemoriesDto } from "../types"

/**
 * Cache das similares das memórias (OPE-164, SOMENTE servidor), para a visualização "Relacionadas" (arestas
 * entre similares nos universos de memórias).
 *
 * Fonte (decisão do dono na OPE-164): o `similar` de `GET /v1/memories/{id}` pelo token admin. O `POST /v1/hints`
 * foi descartado porque cada dica soma consulta e último uso na memória e dispara `memory.consumed` (inflaria o
 * tamanho e o brilho das partículas e o esquecimento do consolidador). O `similar` não tem efeito colateral, mas
 * é do MESMO canal e tem no máximo 3 (vetor; termos sem embeddings).
 *
 * - O primeiro cálculo acontece só quando a rede pede as similares pela primeira vez (`getRelatedMemories`), em
 *   lotes com limite de chamadas simultâneas; a cada lote sai um `engramind-updated` `related-memories`.
 * - Depois, só as memórias criadas, editadas ou removidas são recalculadas, pelos webhooks `memory.*`.
 * - Guarda só ids, canal e notas; nunca o texto.
 */

export const RELATED_BATCH_SIZE = 25
export const RELATED_CONCURRENCY = 4
/** Intervalo mínimo entre preenchimentos (o que faltou ou falhou é tentado de novo depois disso). */
export const RELATED_REFILL_MS = 10 * 60_000
const LIST_PAGE = 200
const RATE_LIMIT_WAIT_MS = 2_000
const EVENT_IDS_LIMIT = 50

interface MemoryDetail {
    memory: Pick<EngramindMemory, "id" | "channel" | "version">
    similar?: { id?: unknown; channel?: unknown; score?: unknown }[]
}

type FillGlobal = typeof globalThis & { __opexRelatedFill?: Promise<void> | null }
const fill = globalThis as FillGlobal

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))

async function mapLimit<T>(items: readonly T[], limit: number, run: (item: T) => Promise<void>): Promise<void> {
    let cursor = 0
    const worker = async () => {
        while (cursor < items.length) {
            const item = items[cursor]!
            cursor += 1
            await run(item)
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

/** Similares de uma memória pelo Engramind (só o mesmo canal; a própria memória fora). `null` = a memória não existe mais. */
export async function fetchRelated(id: string): Promise<{ channel: string; version: number | null; related: { id: string; score: number }[] } | null> {
    let detail: MemoryDetail | null
    try {
        detail = await engramindCall<MemoryDetail>("GET", { path: `/v1/memories/${encodeURIComponent(id)}` })
    } catch (error) {
        if (error instanceof DomainError && error.status === 404) return null
        if (error instanceof DomainError && error.status === 429) {
            await wait(RATE_LIMIT_WAIT_MS)
            detail = await engramindCall<MemoryDetail>("GET", { path: `/v1/memories/${encodeURIComponent(id)}` })
        } else throw error
    }
    if (!detail?.memory) return null
    const channel = detail.memory.channel
    const seen = new Set<string>()
    const related: { id: string; score: number }[] = []
    for (const hit of detail.similar ?? []) {
        if (typeof hit.id !== "string" || hit.id === id || seen.has(hit.id)) continue
        if (typeof hit.score !== "number" || !Number.isFinite(hit.score)) continue
        if (typeof hit.channel === "string" && hit.channel !== channel) continue
        seen.add(hit.id)
        related.push({ id: hit.id, score: hit.score })
    }
    return { channel, version: typeof detail.memory.version === "number" ? detail.memory.version : null, related }
}

/** Tira a memória do cache e das listas das outras. */
export async function removeRelatedMemory(id: string): Promise<void> {
    await engramindDb()
    await EngramindRelatedMemory.deleteOne({ _id: id })
    await EngramindRelatedMemory.updateMany({ "related.id": id }, { $pull: { related: { id } } })
}

/** Recalcula uma memória; erro do Engramind vira aviso e `failedAt` (nunca lança). */
export async function computeRelated(id: string): Promise<"ok" | "gone" | "failed"> {
    try {
        const result = await fetchRelated(id)
        if (!result) {
            await removeRelatedMemory(id)
            return "gone"
        }
        await engramindDb()
        const previous = await EngramindRelatedMemory.findById(id).select({ channel: 1 }).lean<{ channel?: string } | null>()
        await EngramindRelatedMemory.updateOne(
            { _id: id },
            { $set: { channel: result.channel, related: result.related, memoryVersion: result.version, computedAt: new Date(), failedAt: null } },
            { upsert: true },
        )
        // Memória movida de canal: as similares do canal antigo deixam de apontar para ela (a similar é do mesmo canal).
        if (previous?.channel && previous.channel !== result.channel) await EngramindRelatedMemory.updateMany({ channel: previous.channel, "related.id": id }, { $pull: { related: { id } } })
        return "ok"
    } catch (error) {
        engramindLog.warn({ memoria: id, err: errorText(error) }, "[engramind] similares da memória não calculadas; a rede desenha sem as arestas dela")
        await EngramindRelatedMemory.updateOne({ _id: id }, { $set: { failedAt: new Date() } }, { upsert: true }).catch(() => undefined)
        return "failed"
    }
}

/** Ids das memórias ativas e fixadas (paginado; só os ids ficam). */
async function listMemoryIds(): Promise<string[]> {
    const ids: string[] = []
    let cursor: string | undefined
    do {
        const page = await engramindCall<{ memories?: Pick<EngramindMemory, "id">[]; next_cursor?: string | null } | null>("GET", { path: "/v1/memories", query: { status: "active,permanent", limit: LIST_PAGE, cursor } })
        for (const memory of page?.memories ?? []) ids.push(memory.id)
        cursor = page?.next_cursor ?? undefined
    } while (cursor)
    return ids
}

async function readState(): Promise<NonNullable<IEngramindState["relatedMemories"]> | null> {
    await engramindDb()
    const state = await EngramindState.findById(ENGRAMIND_STATE_ID).select({ relatedMemories: 1 }).lean<Pick<IEngramindState, "relatedMemories">>()
    return state?.relatedMemories ?? null
}

/** Preenche o que falta (memória sem cálculo ou que falhou há mais de `RELATED_REFILL_MS`), em lotes. */
export async function fillRelatedMemories(): Promise<void> {
    const ids = await listMemoryIds()
    await engramindDb()
    const docs = await EngramindRelatedMemory.find({ _id: { $in: ids } }).select({ computedAt: 1, failedAt: 1 }).lean<{ _id: string; computedAt: Date | null; failedAt: Date | null }[]>()
    const known = new Map(docs.map((doc) => [doc._id, doc]))
    const now = Date.now()
    const missing = ids.filter((id) => {
        const doc = known.get(id)
        if (!doc) return true
        if (doc.failedAt) return now - new Date(doc.failedAt).getTime() >= RELATED_REFILL_MS
        return !doc.computedAt
    })
    for (let start = 0; start < missing.length; start += RELATED_BATCH_SIZE) {
        await mapLimit(missing.slice(start, start + RELATED_BATCH_SIZE), RELATED_CONCURRENCY, async (id) => void (await computeRelated(id)))
        await publishEngramind({ type: RELATED_MEMORIES_EVENT_TYPE }, { live: false })
    }
    await EngramindState.updateOne({ _id: ENGRAMIND_STATE_ID }, { $set: { "relatedMemories.completedAt": new Date() } })
    engramindLog.info({ memorias: ids.length, calculadas: missing.length }, "[engramind] similares das memórias atualizadas")
}

/** Dispara o preenchimento em segundo plano (um por processo). */
function startFill(): void {
    if (fill.__opexRelatedFill) return
    fill.__opexRelatedFill = fillRelatedMemories()
        .catch((error: unknown) => engramindLog.warn({ err: errorText(error) }, "[engramind] cálculo das similares falhou; a rede desenha sem as arestas"))
        .finally(() => {
            fill.__opexRelatedFill = null
        })
}

/** Espera o preenchimento em andamento (testes). */
export async function relatedFillDone(): Promise<void> {
    await fill.__opexRelatedFill
}

/**
 * Similares guardadas. Na primeira vez marca o pedido e começa o cálculo; depois, completa o que falta a cada
 * `RELATED_REFILL_MS`. Nunca espera o cálculo: a rede desenha com o que já existe.
 */
export async function getRelatedMemories(): Promise<RelatedMemoriesDto> {
    const state = await readState()
    if (!state?.requestedAt) await EngramindState.updateOne({ _id: ENGRAMIND_STATE_ID }, { $set: { relatedMemories: { requestedAt: new Date(), completedAt: null } } }, { upsert: true })
    const completedAt = state?.completedAt ? new Date(state.completedAt).getTime() : null
    if (completedAt === null || Date.now() - completedAt >= RELATED_REFILL_MS) startFill()
    const docs = await EngramindRelatedMemory.find({ "related.0": { $exists: true } }).select({ related: 1 }).lean<{ _id: string; related: { id: string; score: number }[] }[]>()
    const related: RelatedMemoriesDto["related"] = {}
    for (const doc of docs) related[doc._id] = doc.related.map((hit) => ({ id: hit.id, score: hit.score }))
    return { related, pending: Boolean(fill.__opexRelatedFill), ready: completedAt !== null }
}

/**
 * Webhook `memory.*` (depois do repasse às telas): só com o cache já pedido. Criada ou editada → recalcula só
 * ela; removida → sai do cache e das listas das outras. As que apontam para uma memória editada ficam como
 * estão até o próprio recálculo. `memory.archived` não muda nada (a lib descarta as inativas).
 */
export async function onRelatedMemoryEvent(event: { type: string; memory_ids?: unknown }): Promise<boolean> {
    if (event.type !== "memory.created" && event.type !== "memory.updated" && event.type !== "memory.deleted") return false
    const ids = (Array.isArray(event.memory_ids) ? event.memory_ids : []).filter((id): id is string => typeof id === "string" && id.length > 0).slice(0, EVENT_IDS_LIMIT)
    if (!ids.length) return false
    const state = await readState()
    if (!state?.requestedAt) return false
    if (event.type === "memory.deleted") for (const id of ids) await removeRelatedMemory(id)
    else await mapLimit(ids, RELATED_CONCURRENCY, async (id) => void (await computeRelated(id)))
    await publishEngramind({ type: RELATED_MEMORIES_EVENT_TYPE }, { live: false })
    return true
}
