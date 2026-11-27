import { createHash } from "node:crypto"
import { getAiProviderKeyById, type AiProviderKey } from "@/lib/ai/api-keys"
import { dbConnect } from "@/lib/db"
import { AiSubscriptionDay } from "@/lib/db/models/AiSubscriptionDay"
import { loadStoredIntegration } from "@/lib/integrations/store"
import type { IntegrationId } from "@/lib/integrations/catalog"
import { loggerFor } from "@/lib/logger"
import { publishAppEvent } from "@/lib/pusher/channels"
import { utcDateKey } from "../money"
import { AI_BILLING_UPDATED_EVENT, billingOf } from "../schemas"

/**
 * Uso total diário das assinaturas de IA (OPE-203), base do rateio da mensalidade. Só OpenCode Go e Command Code têm
 * API de cota; chaves da mesma assinatura são agrupadas por ela (Go: mesmo ciclo e limites no Console; Command Code:
 * mesma conta) e gravadas num documento por dia (`ai_subscription_days`). As APIs guardam pouco histórico, então a
 * rotina `ai-subscription-days` grava os dias enquanto eles ainda são legíveis. Nada aqui entra no caminho da geração.
 */

const log = () => loggerFor({ feature: "ai-billing", source: "subscription-days" })
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))
const DAY_MS = 86_400_000
/** Janela relida do Go (o Console guarda ~42 dias). */
const GO_LOOKBACK_DAYS = 40

export interface SubscriptionDayRow {
    date: string
    total: number
    partial: boolean
}

export interface SubscriptionAccountRead {
    account: string
    keyIds: string[]
    unit: "usd" | "credits"
    days: SubscriptionDayRow[]
}

/** Id estável da assinatura a partir da assinatura de agrupamento (sem valores de uso). */
export function accountIdOf(provider: string, signature: string): string {
    return `${provider}:${createHash("sha256").update(signature).digest("hex").slice(0, 16)}`
}

async function subscriptionKeys(integrationId: IntegrationId): Promise<AiProviderKey[]> {
    const stored = await loadStoredIntegration(integrationId)
    const ids = (stored?.apiKeys ?? []).filter((item) => billingOf(item.billing).mode === "subscription").map((item) => item.id)
    const keys = await Promise.all(ids.map((id) => getAiProviderKeyById(integrationId, id)))
    return keys.filter((key): key is AiProviderKey => key !== null)
}

/** OpenCode Go: agrupa pelo status do Console e lê o custo por dia (micro-cents → US$). */
export async function readGoSubscriptionDays(keys: readonly AiProviderKey[], nowMs = Date.now()): Promise<SubscriptionAccountRead[]> {
    const [{ fetchGoStatus, fetchGoCostByDay }, { goSubscriptionSignature }] = await Promise.all([import("@/features/opencode-quota/server/go-api"), import("@/features/opencode-quota/go-logic")])
    const groups = new Map<string, AiProviderKey[]>()
    for (const key of keys) {
        try {
            const signature = goSubscriptionSignature(await fetchGoStatus(key.apiKey))
            groups.set(signature, [...(groups.get(signature) ?? []), key])
        } catch (error) {
            log().warn({ keyId: key.id, err: errorText(error) }, "[ai-billing] status da assinatura do OpenCode Go indisponível")
        }
    }
    const reads: SubscriptionAccountRead[] = []
    const to = utcDateKey(new Date(nowMs))
    const from = utcDateKey(new Date(nowMs - GO_LOOKBACK_DAYS * DAY_MS))
    for (const [signature, group] of groups) {
        try {
            const byDay = await fetchGoCostByDay(group[0]!.apiKey, from, to)
            const days: SubscriptionDayRow[] = []
            for (let ms = Date.parse(`${from}T00:00:00Z`); ms <= Date.parse(`${to}T00:00:00Z`); ms += DAY_MS) {
                const date = utcDateKey(new Date(ms))
                days.push({ date, total: Math.round((byDay.get(date) ?? 0) / 1e4) / 1e4, partial: date === to })
            }
            reads.push({ account: accountIdOf("opencode-go", signature), keyIds: group.map((key) => key.id), unit: "usd", days })
        } catch (error) {
            log().warn({ keyId: group[0]!.id, err: errorText(error) }, "[ai-billing] custo por dia do OpenCode Go indisponível")
        }
    }
    return reads
}

/** Command Code: agrupa pela conta e lê os créditos usados por dia do ciclo atual. */
export async function readCommandCodeSubscriptionDays(keys: readonly AiProviderKey[], nowMs = Date.now()): Promise<SubscriptionAccountRead[]> {
    const [{ fetchCcWhoami, fetchCcSubscription }, { ccAccountKey }, { loadCcDays }] = await Promise.all([
        import("@/features/command-code-usage/server/api"),
        import("@/features/command-code-usage/logic"),
        import("@/features/command-code-usage/server/series"),
    ])
    const accounts = new Map<string, { keys: AiProviderKey[]; orgId: string | null }>()
    for (const key of keys) {
        try {
            const whoami = await fetchCcWhoami(key.apiKey)
            const account = ccAccountKey(whoami) ?? `key:${key.id}`
            const entry = accounts.get(account) ?? { keys: [], orgId: whoami.org?.id ?? null }
            entry.keys.push(key)
            accounts.set(account, entry)
        } catch (error) {
            log().warn({ keyId: key.id, err: errorText(error) }, "[ai-billing] conta do Command Code indisponível")
        }
    }
    const reads: SubscriptionAccountRead[] = []
    const today = utcDateKey(new Date(nowMs))
    for (const [account, entry] of accounts) {
        const key = entry.keys[0]!
        try {
            const subscription = await fetchCcSubscription(key.apiKey, entry.orgId)
            if (!subscription?.currentPeriodStart) continue
            const days = await loadCcDays({ apiKey: key.apiKey, keyId: key.id, orgId: entry.orgId, cycleStartMs: Date.parse(subscription.currentPeriodStart), nowMs, forceToday: true })
            const rows: SubscriptionDayRow[] = []
            for (const [date, value] of days) if (value.credits !== null) rows.push({ date, total: Math.max(0, value.credits), partial: value.partial || date === today })
            reads.push({ account: accountIdOf("command-code", account), keyIds: entry.keys.map((item) => item.id), unit: "credits", days: rows })
        } catch (error) {
            log().warn({ keyId: key.id, err: errorText(error) }, "[ai-billing] créditos diários do Command Code indisponíveis")
        }
    }
    return reads
}

/** Grava (idempotente) as leituras; devolve quantos dias mudaram. */
export async function saveSubscriptionDays(provider: string, reads: readonly SubscriptionAccountRead[]): Promise<number> {
    if (!reads.length) return 0
    await dbConnect()
    const ops = reads.flatMap((read) =>
        read.days.map((day) => ({
            updateOne: {
                filter: { provider, account: read.account, date: day.date },
                update: { $set: { keyIds: read.keyIds, total: day.total, unit: read.unit, partial: day.partial, fetchedAt: new Date() } },
                upsert: true,
            },
        })),
    )
    if (!ops.length) return 0
    const result = await AiSubscriptionDay.bulkWrite(ops)
    return result.upsertedCount + result.modifiedCount
}

/** Rotina `ai-subscription-days`: lê e grava o uso diário das assinaturas com API de cota. */
export async function runSubscriptionDaysRoutine(): Promise<string> {
    const parts: string[] = []
    let changed = 0
    for (const [provider, integrationId, read] of [
        ["opencode-go", "ai_opencode_go", readGoSubscriptionDays],
        ["command-code", "ai_command_code", readCommandCodeSubscriptionDays],
    ] as const) {
        const keys = await subscriptionKeys(integrationId)
        if (!keys.length) continue
        const reads = await read(keys)
        const count = await saveSubscriptionDays(provider, reads)
        changed += count
        parts.push(`${provider}: ${reads.length} assinatura(s), ${count} dia(s) atualizado(s)`)
    }
    if (changed > 0) await publishAppEvent(AI_BILLING_UPDATED_EVENT, { kind: "subscription-days" }).catch(() => undefined)
    return parts.length ? parts.join(" | ") : "Nenhuma chave de OpenCode Go ou Command Code com plano de assinatura"
}
