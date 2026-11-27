import type { ModelPrice, PriceRates } from "./types"

/**
 * Tabela oficial do DeepSeek (módulo PURO, OPE-203), conferida em https://api-docs.deepseek.com/quick_start/pricing
 * em 26/11/2026. Preços por 1M de tokens; o DeepSeek não cobra escrita de cache (entrada sem cache = "cache miss").
 *
 * Pico: segunda a sexta, 01:00–04:00 e 06:00–10:00 UTC, pelo horário de INÍCIO da chamada. Todo o resto é fora de pico,
 * inclusive fins de semana e feriados chineses inteiros (o dia do feriado é o do calendário de Pequim, UTC+8; a
 * lista é editável no campo "Feriados fora de pico" da integração DeepSeek).
 */

export const DEEPSEEK_PRICING_URL = "https://api-docs.deepseek.com/quick_start/pricing"

const range = (from: string, days: number): string[] => Array.from({ length: days }, (_, index) => new Date(Date.parse(`${from}T00:00:00Z`) + index * 86_400_000).toISOString().slice(0, 10))

/**
 * Feriados oficiais da China (dias de folga, sem os sábados/domingos de trabalho compensatório), semeados como valor
 * padrão do campo "Feriados fora de pico" da integração DeepSeek (editável). Fonte: avisos do Conselho de Estado
 * 国办发明电〔2025〕7号 (2026) e 国办发明电〔2026〕10号 (2027), em gov.cn.
 */
export const DEEPSEEK_DEFAULT_HOLIDAYS: readonly string[] = [
    // 2026
    ...range("2026-01-01", 3),
    ...range("2026-02-15", 9),
    ...range("2026-04-04", 3),
    ...range("2026-05-01", 5),
    ...range("2026-06-19", 3),
    ...range("2026-09-25", 3),
    ...range("2026-10-01", 7),
    // 2027
    ...range("2027-01-01", 3),
    ...range("2027-02-05", 9),
    ...range("2027-04-03", 3),
    ...range("2027-05-01", 5),
    "2027-06-09",
    "2027-09-15",
    ...range("2027-10-01", 7),
]

/** Texto padrão do campo (uma data por linha). */
export const DEEPSEEK_DEFAULT_HOLIDAYS_TEXT = DEEPSEEK_DEFAULT_HOLIDAYS.join("\n")

interface DeepseekModelTable {
    peak: PriceRates
    offPeak: PriceRates
}

const rates = (cacheHit: number, cacheMiss: number, output: number): PriceRates => ({ inputPerMTok: cacheMiss, cacheReadPerMTok: cacheHit, cacheWritePerMTok: cacheMiss, outputPerMTok: output })

/** `deepseek-flash` = DeepSeek-V4.1-Flash; `deepseek-v4-pro` = DeepSeek-V4-Pro. */
export const DEEPSEEK_TABLE: Record<string, DeepseekModelTable> = {
    "deepseek-flash": { peak: rates(0.006, 0.3, 1.2), offPeak: rates(0.003, 0.15, 0.6) },
    "deepseek-v4-pro": { peak: rates(0.044, 1.32, 3.96), offPeak: rates(0.022, 0.66, 1.98) },
}

/** Nomes antigos atendidos (e cobrados) como o Flash, segundo a página oficial. */
const ALIASES: Record<string, string> = {
    "deepseek-v4-flash": "deepseek-flash",
    "deepseek-v4-flash-vision-exp": "deepseek-flash",
}

export function deepseekTableModel(model: string): string | null {
    const id = model.trim().toLowerCase()
    if (DEEPSEEK_TABLE[id]) return id
    return ALIASES[id] ?? null
}

/** Janelas de pico em UTC: [início, fim) em horas. */
const PEAK_WINDOWS: readonly [number, number][] = [
    [1, 4],
    [6, 10],
]

const BEIJING_OFFSET_MS = 8 * 60 * 60_000

/** Data `AAAA-MM-DD` no calendário de Pequim. */
export function beijingDateKey(at: Date): string {
    return new Date(at.getTime() + BEIJING_OFFSET_MS).toISOString().slice(0, 10)
}

/** Lê a lista editável (uma data `AAAA-MM-DD` por linha, vírgula ou espaço); ignora o que não é data. */
export function parseHolidayList(text: string | null | undefined): Set<string> {
    const dates = new Set<string>()
    for (const token of (text ?? "").split(/[\s,;]+/)) if (/^\d{4}-\d{2}-\d{2}$/.test(token)) dates.add(token)
    return dates
}

export function isDeepseekPeak(at: Date, holidays: ReadonlySet<string> = new Set()): boolean {
    const weekday = at.getUTCDay()
    if (weekday === 0 || weekday === 6) return false
    if (holidays.has(beijingDateKey(at))) return false
    const hour = at.getUTCHours()
    return PEAK_WINDOWS.some(([from, to]) => hour >= from && hour < to)
}

/** Preço do modelo no instante (pico ou fora de pico); `null` para modelo fora da tabela. */
export function deepseekPrice(model: string, at: Date, holidays: ReadonlySet<string> = new Set()): ModelPrice | null {
    const id = deepseekTableModel(model)
    if (!id) return null
    const peak = isDeepseekPeak(at, holidays)
    const table = DEEPSEEK_TABLE[id]!
    return { source: "deepseek-table", tiers: [{ maxContext: null, rates: peak ? table.peak : table.offPeak }], label: peak ? "peak" : "off-peak", catalogAt: null }
}
