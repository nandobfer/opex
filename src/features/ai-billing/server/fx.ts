import { dbConnect } from "@/lib/db"
import { FxRateDaily } from "@/lib/db/models/FxRateDaily"
import { getIntegrationConfig } from "@/lib/integrations/config"
import { debugFetch, integrationDebug } from "@/lib/integrations/debug"
import { addDays, fillCalendarRates, parsePtaxPeriod, ptaxPeriodUrl, type PtaxQuote } from "@/lib/fx/ptax-parse"
import { loggerFor } from "@/lib/logger"
import { publishAppEvent } from "@/lib/pusher/channels"
import { brasiliaDateKey } from "../money"
import { AI_BILLING_UPDATED_EVENT } from "../schemas"

/**
 * PTAX diária (OPE-203): cotação de venda do Banco Central gravada por dia corrido em `fx_rates_daily`. A rotina
 * `fx-ptax-daily` preenche os dias que faltam; a leitura das telas só lê o banco e, se faltar algum dia, pede o
 * preenchimento em segundo plano (as telas recebem `ai-billing-updated` quando ele termina).
 */

const log = () => loggerFor({ feature: "ai-billing", source: "ptax" })
const FX_TIMEOUT_MS = 15_000
/** A rotina relê esta janela para trás (cobre feriados e falhas recentes). */
const BACKFILL_DAYS = 45

/** Cotações dos dias úteis de um período (lança com a causa real). */
export async function fetchPtaxPeriod(from: string, to: string, signal?: AbortSignal): Promise<PtaxQuote[]> {
    const { baseUrl } = await getIntegrationConfig("fx_ptax")
    const timeout = AbortSignal.timeout(FX_TIMEOUT_MS)
    const res = await debugFetch(integrationDebug("fx_ptax"), "PTAX", ptaxPeriodUrl(baseUrl, from, to), {
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    })
    if (!res.ok) throw new Error(`O serviço PTAX respondeu HTTP ${res.status}`)
    return parsePtaxPeriod(await res.json())
}

/**
 * Preenche os dias de `from` a `to` (inclusive). Hoje só é gravado com a cotação do próprio dia (a PTAX sai à tarde);
 * fim de semana e feriado passados herdam o último dia útil. Devolve quantos dias foram gravados.
 */
export async function fillFxRates(from: string, to: string, signal?: AbortSignal): Promise<number> {
    await dbConnect()
    const today = brasiliaDateKey(new Date())
    const end = to > today ? today : to
    if (end < from) return 0
    // Começa uma semana antes para achar o último dia útil anterior ao período.
    const quotes = await fetchPtaxPeriod(addDays(from, -7), end, signal)
    const seed = [...quotes].reverse().find((quote) => quote.date < from) ?? null
    const rows = fillCalendarRates(quotes, from, end, seed).filter((row) => row.date < today || row.quotedDate === row.date)
    if (!rows.length) return 0
    await FxRateDaily.bulkWrite(rows.map((row) => ({ updateOne: { filter: { date: row.date }, update: { $set: { usdBrl: row.usdBrl, quotedDate: row.quotedDate, fetchedAt: new Date() } }, upsert: true } })))
    return rows.length
}

/** Cotações gravadas do período (`AAAA-MM-DD` → R$ por US$); hoje sem cotação herda a última conhecida (sem gravar). */
export async function loadFxRates(from: string, to: string): Promise<{ rates: Map<string, number>; missing: string[] }> {
    await dbConnect()
    const docs = await FxRateDaily.find({ date: { $gte: addDays(from, -7), $lte: to } }).sort({ date: 1 }).lean()
    const known = new Map(docs.map((doc) => [doc.date, doc.usdBrl]))
    const rates = new Map<string, number>()
    const missing: string[] = []
    const today = brasiliaDateKey(new Date())
    let last: number | null = null
    for (let date = addDays(from, -7); date <= to; date = addDays(date, 1)) {
        const own = known.get(date)
        if (own !== undefined) last = own
        if (date < from) continue
        if (own !== undefined) rates.set(date, own)
        else if (date >= today && last !== null) rates.set(date, last)
        else missing.push(date)
    }
    return { rates, missing }
}

const inflight = new Set<string>()

/** Preenche em segundo plano os dias que faltaram numa leitura e avisa as telas. */
export function requestFxBackfill(missing: readonly string[]): void {
    if (!missing.length) return
    const from = missing[0]!
    const to = missing[missing.length - 1]!
    const key = `${from}:${to}`
    if (inflight.has(key)) return
    inflight.add(key)
    void fillFxRates(from, to)
        .then(async (count) => {
            if (count > 0) await publishAppEvent(AI_BILLING_UPDATED_EVENT, { kind: "fx" })
        })
        .catch((error: unknown) => log().warn({ from, to, err: error instanceof Error ? error.message : String(error) }, "[ai-billing] preenchimento da PTAX falhou"))
        .finally(() => inflight.delete(key))
}

/** Rotina `fx-ptax-daily`: grava os últimos dias que faltam (e o de hoje, quando a PTAX já saiu). */
export async function runFxPtaxRoutine(): Promise<string> {
    const today = brasiliaDateKey(new Date())
    const from = addDays(today, -BACKFILL_DAYS)
    await dbConnect()
    const have = new Set((await FxRateDaily.find({ date: { $gte: from, $lte: today } }).select({ date: 1 }).lean()).map((doc) => doc.date))
    let first: string | null = null
    for (let date = from; date <= today; date = addDays(date, 1)) {
        if (!have.has(date)) {
            first = date
            break
        }
    }
    if (!first) return "PTAX em dia"
    const count = await fillFxRates(first, today)
    if (count > 0) await publishAppEvent(AI_BILLING_UPDATED_EVENT, { kind: "fx" }).catch(() => undefined)
    const latest = await FxRateDaily.findOne({}).sort({ date: -1 }).lean()
    return `${count} dia(s) gravado(s)${latest ? `; última cotação R$ ${latest.usdBrl.toLocaleString("pt-BR", { minimumFractionDigits: 4 })} (${latest.quotedDate})` : ""}`
}

