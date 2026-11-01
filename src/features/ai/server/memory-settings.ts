import { engramindCall } from "@/features/engramind/server/client"
import { engramindCodeOf } from "@/features/engramind/server/errors"
import type { Category, ChannelSettingsView, SettingMeta } from "@/features/engramind/types"
import { DEFAULT_MEMORY_TEXT_LIMITS, type MemoryTextLimits } from "../memory-text"

/**
 * Configurações do Engramind que valem para as memórias dos agentes: limites do texto
 * (`memory.text_min`, `memory.text_max` com sobreposição por canal), `categories.list` e
 * `limits.max_batch`. Cache curto (60 s) para não ler a cada gravação.
 */

const TTL_MS = 60_000

export interface MemorySettings extends MemoryTextLimits {
    categories: Category[]
    maxBatch: number
    budgetTokens: number
}

let globalCache: { at: number; value: MemorySettings } | null = null
const channelCache = new Map<string, { at: number; textMax: number | null; budgetTokens: number | null }>()

const numberOf = (value: unknown, fallback: number) => (typeof value === "number" && Number.isFinite(value) ? value : fallback)

export async function memorySettings(): Promise<MemorySettings> {
    if (globalCache && Date.now() - globalCache.at < TTL_MS) return globalCache.value
    const view = await engramindCall<{ settings: SettingMeta[] }>("GET", { path: "/v1/settings" })
    const byKey = new Map((view?.settings ?? []).map((item) => [item.key, item.value]))
    const categories = Array.isArray(byKey.get("categories.list")) ? (byKey.get("categories.list") as Category[]).filter((item) => item && typeof item.key === "string") : []
    const value: MemorySettings = {
        textMin: numberOf(byKey.get("memory.text_min"), DEFAULT_MEMORY_TEXT_LIMITS.textMin),
        textMax: numberOf(byKey.get("memory.text_max"), DEFAULT_MEMORY_TEXT_LIMITS.textMax),
        categories,
        maxBatch: numberOf(byKey.get("limits.max_batch"), 100),
        budgetTokens: numberOf(byKey.get("context.budget_tokens"), 4000),
    }
    globalCache = { at: Date.now(), value }
    return value
}

async function channelOverrides(channel: string): Promise<{ textMax: number | null; budgetTokens: number | null }> {
    const cached = channelCache.get(channel)
    if (cached && Date.now() - cached.at < TTL_MS) return cached
    let textMax: number | null = null
    let budgetTokens: number | null = null
    try {
        const view = await engramindCall<ChannelSettingsView>("GET", { path: `/v1/channels/${encodeURIComponent(channel)}/settings` })
        for (const item of view?.settings ?? []) {
            if (item.key === "memory.text_max" && typeof item.value === "number") textMax = item.value
            if (item.key === "context.budget_tokens" && typeof item.value === "number") budgetTokens = item.value
        }
    } catch (error) {
        if (engramindCodeOf(error) !== "CHANNEL_NOT_FOUND") throw error
    }
    const entry = { at: Date.now(), textMax, budgetTokens }
    channelCache.set(channel, entry)
    return entry
}

/** Limites do texto de um canal (o máximo do canal, quando sobreposto, vale sobre o global). */
export async function memoryLimitsFor(channel: string | null): Promise<MemoryTextLimits> {
    const global = await memorySettings()
    if (!channel) return { textMin: global.textMin, textMax: global.textMax }
    const override = await channelOverrides(channel)
    return { textMin: global.textMin, textMax: override.textMax ?? global.textMax }
}

/** Orçamento de tokens do texto completo de um canal (sobreposição do canal ou o global). */
export async function channelBudgetFor(channel: string): Promise<number> {
    const global = await memorySettings()
    return (await channelOverrides(channel)).budgetTokens ?? global.budgetTokens
}

/** Testes: limpa o cache das configurações. */
export function resetMemorySettingsCache(): void {
    globalCache = null
    channelCache.clear()
}
