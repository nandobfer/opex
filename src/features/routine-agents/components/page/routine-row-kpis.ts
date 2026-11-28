import { COST_KIND_TONE, type CostKind } from "@/features/ai-billing/cost-tone"
import { formatCostPair } from "../../format"
import type { RoutineAgentMetricsDto, RoutineMoneyPair } from "../../types"

/**
 * KPIs de um item da lista `/agentes-rotineiros` (OPE-213, módulo PURO), na ordem da tela: a fileira das execuções e
 * dos tokens e a fileira dos custos. Decisões do dono (27/11/2026): médias de tokens entram; médias de custo com o
 * efetivo e o de tabela separados, cada um com a sua cor. Médias com o critério da Visão geral: por execução =
 * custo ÷ execuções com custo; por dia = custo ÷ dias corridos do período. Sem dado, `null` ("—", nunca 0).
 */
export interface RoutineRowKpi {
    key: string
    label: string
    value: number | null
    format: "count" | "tokens" | "usd"
    title?: string
    accentColor?: string
}

type Cost = RoutineAgentMetricsDto["cost"]

/** O parcial/estimado já vai no `formatCostPair`; aqui só os modelos sem preço. */
const marks = (totals: Cost["totals"]) => (totals.missingPrices.length ? ` · sem preço: ${totals.missingPrices.join(", ")}` : "")

const pick = (pair: RoutineMoneyPair, kind: CostKind) => ({ usd: kind === "list" ? pair.listUsd : pair.effectiveUsd, brl: kind === "list" ? pair.listBrl : pair.effectiveBrl })

function costKpis(cost: Cost | undefined, kind: CostKind): RoutineRowKpi[] {
    const name = kind === "list" ? "tabela" : "efetivo"
    const accentColor = COST_KIND_TONE[kind].color
    const totals = cost?.totals
    const total = totals ? pick(totals, kind) : { usd: null, brl: null }
    const flags = { partial: totals?.partial, estimated: totals?.estimated }
    const average = (key: "perRun" | "perCalendarDay", label: string, basis: string): RoutineRowKpi => {
        const pair = cost ? pick(cost[key], kind) : { usd: null, brl: null }
        return { key: `${key}-${kind}`, label: `${label} (${name})`, value: pair.usd, format: "usd", accentColor, title: `${label} · custo ${name}: ${formatCostPair(pair.usd, pair.brl, flags)} · ${basis}${totals ? marks(totals) : ""}` }
    }
    return [
        { key: `total-${kind}`, label: COST_KIND_TONE[kind].label, value: total.usd, format: "usd", accentColor, title: `${COST_KIND_TONE[kind].label}: ${formatCostPair(total.usd, total.brl, flags)}${totals ? marks(totals) : ""}` },
        average("perRun", "Média por execução", `${cost?.runsWithCost ?? 0} execução(ões) com custo`),
        average("perCalendarDay", "Média por dia", `${cost?.calendarDays ?? 0} dia(s) corrido(s)`),
    ]
}

export function routineRowKpis(metrics: RoutineAgentMetricsDto | undefined): RoutineRowKpi[] {
    const kpis = metrics?.kpis
    return [
        { key: "runs", label: "Execuções", value: kpis?.runs ?? 0, format: "count" },
        { key: "completed", label: "Concluídas", value: kpis?.completed ?? 0, format: "count" },
        { key: "errors", label: "Com erro", value: kpis?.errors ?? 0, format: "count" },
        { key: "tokens", label: "Tokens", value: kpis?.tokens ?? 0, format: "tokens" },
        { key: "tokens-per-run", label: "Tokens por execução", value: kpis?.tokensPerRun ?? null, format: "tokens", title: "Tokens ÷ execuções do período" },
        { key: "tokens-per-day", label: "Tokens por dia", value: kpis?.tokensPerDay ?? null, format: "tokens", title: `Tokens ÷ ${metrics?.cost.calendarDays ?? 0} dia(s) corrido(s)` },
        ...costKpis(metrics?.cost, "effective"),
        ...costKpis(metrics?.cost, "list"),
    ]
}
