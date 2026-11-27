import { dbConnect } from "@/lib/db"
import { AiConsumption } from "@/lib/db/models/AiConsumption"
import { AiSubscriptionDay } from "@/lib/db/models/AiSubscriptionDay"
import type { StoredApiKey } from "@/lib/integrations/store"
import { autoExhaustionAt, creditsStartOf, creditsStateAt } from "../credits"
import { cycleFor, dailyQuota } from "../cycle"
import { hasSubscriptionApi } from "../effective"
import { brasiliaDateKey, formatBrl, formatUsd, utcDateKey } from "../money"
import { billingOf, type StoredAiKeyBilling, type SubscriptionBilling } from "../schemas"

/**
 * Avisos do plano de cada chave na lista de chaves (OPE-203): créditos vencidos ou esgotados, chaves da mesma
 * assinatura com valores diferentes e o resumo do ciclo atual da assinatura (ociosidade: dias sem uso nenhum, que
 * aparecem no plano mas não são atribuídos a nenhum agente).
 */

const DAY_MS = 86_400_000
const money = (value: number, currency: "USD" | "BRL") => (currency === "USD" ? formatUsd(value) : formatBrl(value))
const samePlan = (a: SubscriptionBilling, b: SubscriptionBilling) => a.amount === b.amount && a.currency === b.currency && a.renewalDay === b.renewalDay && (a.iofPercent ?? 0) === (b.iofPercent ?? 0)

export async function keyBillingNotices(provider: string, items: readonly StoredApiKey[], now = new Date()): Promise<Map<string, string[]>> {
    await dbConnect()
    const notices = new Map<string, string[]>()
    const push = (keyId: string, text: string) => notices.set(keyId, [...(notices.get(keyId) ?? []), text])
    const plans = new Map<string, StoredAiKeyBilling>(items.map((item) => [item.id, billingOf(item.billing)]))
    const names = new Map(items.map((item) => [item.id, item.name]))
    const today = utcDateKey(now)

    for (const [keyId, billing] of plans) {
        if (billing.mode === "credits") {
            const start = creditsStartOf(billing)
            const rows = await AiConsumption.find({ apiKeyId: keyId, ...(start ? { createdAt: { $gte: new Date(`${start}T03:00:00Z`) } } : {}), "listCost.usd": { $ne: null } })
                .select({ createdAt: 1, "listCost.usd": 1 })
                .lean<{ createdAt: Date; listCost: { usd: number } }[]>()
            const used = rows.reduce((sum, row) => sum + row.listCost.usd, 0)
            const state = creditsStateAt(billing, now, brasiliaDateKey(now), { autoExhaustedAt: autoExhaustionAt(rows.map((row) => ({ at: new Date(row.createdAt), listUsd: row.listCost.usd })), billing.faceValueUsd), paidUsdRate: 1 })
            if (state.status === "expired") push(keyId, "Créditos vencidos: as chamadas usam o custo de tabela (pago por uso).")
            else if (state.status === "exhausted") push(keyId, "Créditos esgotados: as chamadas usam o custo de tabela (pago por uso).")
            else push(keyId, `Opex já usou ${formatUsd(used)} de ${formatUsd(billing.faceValueUsd)} (custo de tabela).`)
            continue
        }
        if (billing.mode !== "subscription") continue
        const cycle = cycleFor(today, billing.renewalDay)
        const dates: string[] = []
        for (let ms = Date.parse(`${cycle.start}T00:00:00Z`); ms <= Date.parse(`${today}T00:00:00Z`); ms += DAY_MS) dates.push(utcDateKey(new Date(ms)))
        let idleDays = 0
        if (hasSubscriptionApi(provider)) {
            const docs = await AiSubscriptionDay.find({ provider, keyIds: keyId, date: { $in: dates } }).lean()
            const totals = new Map(docs.map((doc) => [doc.date, doc.total]))
            idleDays = dates.filter((date) => date !== today && totals.get(date) === 0).length
            const latest = [...docs].sort((a, b) => b.date.localeCompare(a.date))[0]
            for (const otherId of latest?.keyIds ?? []) {
                const other = plans.get(otherId)
                if (otherId === keyId || !other) continue
                if (other.mode !== "subscription") push(keyId, `A chave ${names.get(otherId) ?? otherId} é da mesma assinatura e está sem plano de assinatura.`)
                else if (!samePlan(billing, other)) push(keyId, `A chave ${names.get(otherId) ?? otherId} é da mesma assinatura com valores diferentes: confira o plano das duas.`)
            }
        } else {
            const rows = await AiConsumption.aggregate<{ _id: string }>([
                { $match: { apiKeyId: keyId, createdAt: { $gte: new Date(`${cycle.start}T00:00:00Z`) } } },
                { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "UTC" } } } },
            ])
            const usedDays = new Set(rows.map((row) => row._id))
            idleDays = dates.filter((date) => date !== today && !usedDays.has(date)).length
        }
        const idle = idleDays * dailyQuota(billing, today)
        push(keyId, `Ciclo atual (desde ${cycle.start.slice(8, 10)}/${cycle.start.slice(5, 7)}): ${idleDays} dia(s) sem uso, ociosidade de ${money(idle, billing.currency)} (não atribuída a nenhum agente).`)
    }
    return notices
}
