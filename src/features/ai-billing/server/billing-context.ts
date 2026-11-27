import { dbConnect } from "@/lib/db"
import { AiConsumption } from "@/lib/db/models/AiConsumption"
import { AiSubscriptionDay } from "@/lib/db/models/AiSubscriptionDay"
import { getAiProvider, type AiProviderId } from "@/lib/ai/providers"
import { loadStoredIntegration } from "@/lib/integrations/store"
import { loggerFor } from "@/lib/logger"
import { autoExhaustionAt, creditsStartOf } from "../credits"
import { hasSubscriptionApi, type BillingLookup, type CostStepInput, type KeyBillingInfo, type SubscriptionDayTotal } from "../effective"
import { brasiliaDateKey, utcDateKey } from "../money"
import { billingOf } from "../schemas"
import { loadFxRates, requestFxBackfill } from "./fx"

/**
 * Contexto do custo efetivo (OPE-203): planos das chaves dos passos, PTAX do período, uso total diário das
 * assinaturas e o esgotamento dos créditos. Só lê o banco; o que falta (PTAX, dias das assinaturas) é pedido em
 * segundo plano e as telas recebem `ai-billing-updated` quando chega.
 */

const log = () => loggerFor({ feature: "ai-billing", source: "context" })
const SUBSCRIPTION_REFRESH_MS = 10 * 60_000
let lastSubscriptionRefresh = 0

function requestSubscriptionRefresh(): void {
    if (Date.now() - lastSubscriptionRefresh < SUBSCRIPTION_REFRESH_MS) return
    lastSubscriptionRefresh = Date.now()
    void import("./subscription-days")
        .then(({ runSubscriptionDaysRoutine }) => runSubscriptionDaysRoutine())
        .catch((error: unknown) => log().warn({ err: error instanceof Error ? error.message : String(error) }, "[ai-billing] leitura das assinaturas em segundo plano falhou"))
}

/** Somente testes. */
export function resetBillingContextForTests(): void {
    lastSubscriptionRefresh = 0
}

async function loadKeys(providers: readonly string[]): Promise<Map<string, KeyBillingInfo>> {
    const keys = new Map<string, KeyBillingInfo>()
    for (const provider of providers) {
        let integrationId
        try {
            integrationId = getAiProvider(provider as AiProviderId).integrationId
        } catch {
            continue
        }
        const stored = await loadStoredIntegration(integrationId)
        for (const item of stored?.apiKeys ?? []) keys.set(item.id, { keyId: item.id, name: item.name, provider, billing: billingOf(item.billing) })
    }
    return keys
}

const dayKey = (keyId: string, date: string) => `${keyId}|${date}`

/** Monta o contexto para os passos informados. */
export async function buildBillingLookup(steps: readonly CostStepInput[]): Promise<BillingLookup> {
    await dbConnect()
    const providers = [...new Set(steps.map((step) => step.provider))]
    const keys = await loadKeys(providers)
    const used = [...new Set(steps.map((step) => step.apiKeyId).filter((id): id is string => Boolean(id)))].map((id) => keys.get(id)).filter((key): key is KeyBillingInfo => Boolean(key))

    // PTAX: os dias dos passos e os inícios dos créditos pagos em R$.
    const brDates = steps.map((step) => brasiliaDateKey(step.at))
    for (const key of used) if (key.billing.mode === "credits" && key.billing.paidCurrency === "BRL") brDates.push(creditsStartOf(key.billing) ?? brDates[0] ?? "")
    const fxDates = brDates.filter(Boolean).sort()
    const fx = fxDates.length ? await loadFxRates(fxDates[0]!, fxDates[fxDates.length - 1]!) : { rates: new Map<string, number>(), missing: [] }
    const neededMissing = fx.missing.filter((date) => fxDates.includes(date))
    if (neededMissing.length) requestFxBackfill(neededMissing)

    // Assinaturas: uso total do dia (API de cota gravada) ou a soma dos passos dos rotineiros (sem API).
    const subscriptionKeys = used.filter((key) => key.billing.mode === "subscription")
    const utcDates = [...new Set(steps.map((step) => utcDateKey(step.at)))]
    const apiTotals = new Map<string, number>()
    const routineTotals = new Map<string, number>()
    const apiKeys = subscriptionKeys.filter((key) => hasSubscriptionApi(key.provider))
    if (apiKeys.length && utcDates.length) {
        const docs = await AiSubscriptionDay.find({ keyIds: { $in: apiKeys.map((key) => key.keyId) }, date: { $in: utcDates } }).lean()
        for (const doc of docs) for (const keyId of doc.keyIds) apiTotals.set(dayKey(keyId, doc.date), doc.total)
        const missing = steps.some((step) => step.apiKeyId && apiKeys.some((key) => key.keyId === step.apiKeyId) && !apiTotals.has(dayKey(step.apiKeyId, utcDateKey(step.at))))
        if (missing) requestSubscriptionRefresh()
    }
    const plainKeys = subscriptionKeys.filter((key) => !hasSubscriptionApi(key.provider))
    if (plainKeys.length && utcDates.length) {
        const sorted = [...utcDates].sort()
        const rows = await AiConsumption.aggregate<{ _id: { key: string; date: string }; total: number }>([
            { $match: { apiKeyId: { $in: plainKeys.map((key) => key.keyId) }, createdAt: { $gte: new Date(`${sorted[0]}T00:00:00Z`), $lt: new Date(Date.parse(`${sorted[sorted.length - 1]}T00:00:00Z`) + 86_400_000) }, "listCost.usd": { $ne: null } } },
            { $group: { _id: { key: "$apiKeyId", date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "UTC" } } }, total: { $sum: "$listCost.usd" } } },
        ])
        for (const row of rows) routineTotals.set(dayKey(row._id.key, row._id.date), row.total)
    }

    // Créditos: instante em que a soma do Opex passou do valor de face.
    const exhausted = new Map<string, Date | null>()
    for (const key of used) {
        if (key.billing.mode !== "credits") continue
        const start = creditsStartOf(key.billing)
        const rows = await AiConsumption.find({ apiKeyId: key.keyId, ...(start ? { createdAt: { $gte: new Date(`${start}T03:00:00Z`) } } : {}), "listCost.usd": { $ne: null } })
            .select({ createdAt: 1, "listCost.usd": 1 })
            .sort({ createdAt: 1 })
            .lean<{ createdAt: Date; listCost: { usd: number } }[]>()
        exhausted.set(key.keyId, autoExhaustionAt(rows.map((row) => ({ at: new Date(row.createdAt), listUsd: row.listCost.usd })), key.billing.faceValueUsd))
    }

    return {
        key: (keyId) => keys.get(keyId) ?? null,
        fx: (date) => fx.rates.get(date) ?? null,
        subscriptionDay: (provider, keyId, date): SubscriptionDayTotal =>
            hasSubscriptionApi(provider) ? { kind: "api", total: apiTotals.get(dayKey(keyId, date)) ?? null } : { kind: "routine", total: routineTotals.get(dayKey(keyId, date)) ?? 0 },
        creditsExhaustedAt: (keyId) => exhausted.get(keyId) ?? null,
    }
}
