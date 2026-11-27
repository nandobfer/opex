import { loggerFor } from "@/lib/logger"
import type { AiBilling } from "../provider-cost"
import { commandCodePrice, type CommandCodePricing } from "./command-code"
import { listCostOf, missingCost, reportedListCost } from "./compute"
import { deepseekPrice, parseHolidayList } from "./deepseek"
import { isModelsDevProvider, modelsDevPrice, parseModelsDevCatalog, type ModelsDevCatalog } from "./models-dev"
import type { ListCost, ModelPrice, TokenBreakdown } from "./types"

/**
 * Custo de tabela no servidor (OPE-203). `createStepPricer` carrega a tabela do provedor UMA vez por turno — com
 * prazo próprio e o sinal de quem pediu — e calcula cada passo de forma síncrona. Fonte que falha ou estoura o prazo:
 * vale a última cópia boa (memória, depois o banco), com aviso no log; sem cópia, os passos ficam sem preço com o
 * motivo. Cancelamento de quem pediu propaga (nunca vira "sem preço").
 */

const log = () => loggerFor({ module: "ai", feature: "pricing" })

export const PRICE_CATALOG_TIMEOUT_MS = 8_000
const MODELS_DEV_TTL_MS = 6 * 60 * 60_000
const PERSIST_EVERY_MS = 60 * 60_000

interface CatalogCopy<T> {
    data: T
    at: string
}

interface PricingStore {
    modelsDev: (CatalogCopy<ModelsDevCatalog> & { loadedAt: number }) | null
    persistedAt: Map<string, number>
}

const globalStore = globalThis as typeof globalThis & { __aiPricingStore?: PricingStore }
const store = (): PricingStore => (globalStore.__aiPricingStore ??= { modelsDev: null, persistedAt: new Map() })

/** Somente testes: zera as cópias em memória. */
export function resetPricingCacheForTests(): void {
    globalStore.__aiPricingStore = undefined
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))

function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
    const timeout = AbortSignal.timeout(ms)
    return signal ? AbortSignal.any([signal, timeout]) : timeout
}

async function persistCopy(source: string, data: unknown): Promise<void> {
    const state = store()
    if (Date.now() - (state.persistedAt.get(source) ?? 0) < PERSIST_EVERY_MS) return
    state.persistedAt.set(source, Date.now())
    try {
        const [{ dbConnect }, { AiPriceCatalog }] = await Promise.all([import("@/lib/db"), import("@/lib/db/models/AiPriceCatalog")])
        await dbConnect()
        await AiPriceCatalog.updateOne({ source }, { $set: { data, fetchedAt: new Date() } }, { upsert: true })
    } catch (error) {
        log().warn({ source, err: errorText(error) }, "[ai] falha ao gravar a cópia do catálogo de preços")
    }
}

async function storedCopy<T>(source: string): Promise<CatalogCopy<T> | null> {
    try {
        const [{ dbConnect }, { AiPriceCatalog }] = await Promise.all([import("@/lib/db"), import("@/lib/db/models/AiPriceCatalog")])
        await dbConnect()
        const doc = await AiPriceCatalog.findOne({ source }).lean()
        return doc?.data ? { data: doc.data as T, at: new Date(doc.fetchedAt).toISOString() } : null
    } catch (error) {
        log().warn({ source, err: errorText(error) }, "[ai] cópia do catálogo de preços indisponível no banco")
        return null
    }
}

/** Catálogo do models.dev (Anthropic, OpenAI, Gemini): memória por 6 h; falhou, a última cópia boa. */
export async function loadModelsDevCatalog(signal?: AbortSignal, options: { fresh?: boolean } = {}): Promise<CatalogCopy<ModelsDevCatalog> | null> {
    const state = store()
    if (!options.fresh && state.modelsDev && Date.now() - state.modelsDev.loadedAt < MODELS_DEV_TTL_MS) return state.modelsDev
    try {
        const [{ getIntegrationConfig }, { debugFetch, integrationDebug }] = await Promise.all([import("@/lib/integrations/config"), import("@/lib/integrations/debug")])
        const { apiUrl } = await getIntegrationConfig("models_dev")
        const res = await debugFetch(integrationDebug("models_dev"), "models.dev", apiUrl, { headers: { Accept: "application/json" }, cache: "no-store", signal: withTimeout(signal, PRICE_CATALOG_TIMEOUT_MS) })
        if (!res.ok) throw new Error(`O models.dev respondeu HTTP ${res.status}`)
        const catalog = parseModelsDevCatalog(await res.json())
        if (!Object.values(catalog).some((models) => models && Object.keys(models).length)) throw new Error("Catálogo do models.dev sem os provedores esperados")
        const copy = { data: catalog, at: new Date().toISOString(), loadedAt: Date.now() }
        state.modelsDev = copy
        void persistCopy("models.dev", catalog)
        return copy
    } catch (error) {
        if (signal?.aborted) throw error
        if (state.modelsDev) {
            log().warn({ err: errorText(error) }, "[ai] models.dev indisponível; usando o último catálogo de preços lido")
            return state.modelsDev
        }
        const stored = await storedCopy<ModelsDevCatalog>("models.dev")
        if (stored) {
            log().warn({ err: errorText(error), at: stored.at }, "[ai] models.dev indisponível; usando a cópia do catálogo de preços gravada no banco")
            state.modelsDev = { ...stored, loadedAt: 0 }
            return stored
        }
        log().warn({ err: errorText(error) }, "[ai] models.dev indisponível e sem cópia anterior: passos sem preço")
        return null
    }
}

/** Preços do Command Code pelo catálogo da geração (prazo e cópia em memória dele); sem ele, a cópia do banco. */
export async function loadCommandCodePricing(signal?: AbortSignal): Promise<CatalogCopy<Record<string, CommandCodePricing>> | null> {
    const { commandCodePricingCatalog } = await import("../command-code")
    const live = await commandCodePricingCatalog(signal)
    if (live && Object.keys(live.pricing).length) {
        void persistCopy("command-code", live.pricing)
        return { data: live.pricing, at: live.at }
    }
    const stored = await storedCopy<Record<string, CommandCodePricing>>("command-code")
    if (stored) log().warn({ at: stored.at }, "[ai] catálogo do Command Code sem preços; usando a cópia gravada no banco")
    else log().warn("[ai] catálogo do Command Code indisponível e sem cópia anterior: passos sem preço")
    return stored
}

async function deepseekHolidays(): Promise<Set<string>> {
    try {
        const { getIntegrationConfig } = await import("@/lib/integrations/config")
        return parseHolidayList((await getIntegrationConfig("ai_deepseek")).offPeakHolidays)
    } catch (error) {
        log().warn({ err: errorText(error) }, "[ai] feriados do DeepSeek indisponíveis: nenhum feriado considerado")
        return new Set()
    }
}

export interface StepPricer {
    /** Custo de tabela do passo que começou em `at`. */
    price(tokens: TokenBreakdown, at: Date, billing?: AiBilling | null): ListCost
}

/** Preço fixo carregado (ou o motivo de não haver preço). */
function fromPrice(price: ModelPrice | null, reason: string, source: ListCost["source"]): StepPricer {
    return { price: (tokens) => (price ? listCostOf(tokens, price) : missingCost(reason, source)) }
}

/**
 * Prepara o preço do modelo para um turno. Lança só quando `signal` foi cancelado; qualquer outra falha vira um
 * pricer sem preço (com o motivo) para não segurar o turno.
 */
export async function createStepPricer(input: { provider: string; model: string; signal?: AbortSignal }): Promise<StepPricer> {
    const { provider, model, signal } = input
    if (provider === "opencode-go") return { price: (_tokens, _at, billing) => reportedListCost(billing?.listCostUsd, "opencode-go-response") }
    if (provider === "deepseek") {
        const holidays = await deepseekHolidays()
        return {
            price: (tokens, at) => {
                const price = deepseekPrice(model, at, holidays)
                return price ? listCostOf(tokens, price) : missingCost(`O modelo ${model} não está na tabela oficial do DeepSeek`, "deepseek-table")
            },
        }
    }
    if (provider === "command-code") {
        const catalog = await loadCommandCodePricing(signal)
        if (!catalog) return fromPrice(null, "Catálogo de preços do Command Code indisponível", "command-code-catalog")
        return fromPrice(commandCodePrice(catalog.data[model], catalog.at), `O modelo ${model} não tem preço no catálogo do Command Code`, "command-code-catalog")
    }
    if (isModelsDevProvider(provider)) {
        const catalog = await loadModelsDevCatalog(signal)
        if (!catalog) return fromPrice(null, "Catálogo de preços do models.dev indisponível", "models.dev")
        return fromPrice(modelsDevPrice(catalog.data, provider, model, catalog.at), `O modelo ${model} não tem preço no models.dev`, "models.dev")
    }
    return fromPrice(null, `O provedor ${provider} não tem tabela de preço`, null)
}
