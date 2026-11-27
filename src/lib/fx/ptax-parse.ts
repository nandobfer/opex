/**
 * PTAX do Banco Central (módulo PURO, OPE-203). `CotacaoDolarPeriodo` (API Olinda, OData) devolve
 * `{ value: [{ cotacaoCompra, cotacaoVenda, dataHoraCotacao: "AAAA-MM-DD HH:MM:SS.ffffff" }] }`, um item por dia útil
 * (conferido em 26/11/2026). Usamos a cotação de VENDA; fim de semana e feriado herdam o último dia útil anterior.
 */

export interface PtaxQuote {
    /** Dia útil da cotação (`AAAA-MM-DD`). */
    date: string
    usdBrl: number
}

/** Data `MM-DD-AAAA` que a API Olinda espera. */
export function olindaDate(dateKey: string): string {
    const [year, month, day] = dateKey.split("-")
    return `${month}-${day}-${year}`
}

/** URL do período (as aspas simples fazem parte do parâmetro OData). */
export function ptaxPeriodUrl(baseUrl: string, from: string, to: string): string {
    const base = baseUrl.replace(/\/+$/, "")
    return `${base}/CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)?@dataInicial='${olindaDate(from)}'&@dataFinalCotacao='${olindaDate(to)}'&$format=json&$select=cotacaoVenda,dataHoraCotacao`
}

/** Cotações do corpo; com mais de um boletim no dia, vale o último (fechamento). */
export function parsePtaxPeriod(body: unknown): PtaxQuote[] {
    const items = (body as { value?: unknown } | null)?.value
    if (!Array.isArray(items)) throw new Error("Resposta da PTAX fora do formato esperado (sem a lista value)")
    const byDate = new Map<string, { at: string; usdBrl: number }>()
    for (const item of items as { cotacaoVenda?: unknown; dataHoraCotacao?: unknown }[]) {
        const at = typeof item?.dataHoraCotacao === "string" ? item.dataHoraCotacao : null
        const sell = typeof item?.cotacaoVenda === "number" && Number.isFinite(item.cotacaoVenda) && item.cotacaoVenda > 0 ? item.cotacaoVenda : null
        if (!at || sell === null || !/^\d{4}-\d{2}-\d{2}/.test(at)) continue
        const date = at.slice(0, 10)
        const previous = byDate.get(date)
        if (!previous || at > previous.at) byDate.set(date, { at, usdBrl: sell })
    }
    return [...byDate.entries()].map(([date, value]) => ({ date, usdBrl: value.usdBrl })).sort((a, b) => a.date.localeCompare(b.date))
}

const DAY_MS = 86_400_000

export function addDays(dateKey: string, days: number): string {
    return new Date(Date.parse(`${dateKey}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

export function dateKeysBetween(from: string, to: string): string[] {
    const keys: string[] = []
    for (let key = from; key <= to; key = addDays(key, 1)) keys.push(key)
    return keys
}

/**
 * Cotação de cada dia corrido de `from` a `to`: o dia útil herda a própria; os demais, a do último dia útil anterior
 * (`seed` = última conhecida antes de `from`). Dia sem cotação anterior conhecida fica de fora.
 */
export function fillCalendarRates(quotes: readonly PtaxQuote[], from: string, to: string, seed: PtaxQuote | null = null): { date: string; usdBrl: number; quotedDate: string }[] {
    const byDate = new Map(quotes.map((quote) => [quote.date, quote]))
    let last = seed
    const rows: { date: string; usdBrl: number; quotedDate: string }[] = []
    for (const date of dateKeysBetween(from, to)) {
        const own = byDate.get(date)
        if (own) last = own
        if (last) rows.push({ date, usdBrl: last.usdBrl, quotedDate: last.date })
    }
    return rows
}
