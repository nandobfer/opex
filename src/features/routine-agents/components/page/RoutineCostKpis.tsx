"use client"

import { KpiCard } from "@/components/metrics/KpiCard"
import { formatMetricValue } from "@/components/metrics/format"
import { formatBrl, formatUsd } from "@nandobfer/integracoes/modules/integrations/ia/features/ai-billing/money"
import type { RoutineCostKpisDto, RoutineMoneyPair } from "../../types"

const usd = (value: number) => formatMetricValue(value, "usd")
const brlLine = (value: number | null) => (value === null ? "R$ indisponível (sem cotação PTAX)" : formatBrl(value))

function marks(cost: RoutineCostKpisDto["totals"]): string {
    const list = [cost.partial ? "Parcial" : null, cost.estimated ? "inclui estimados" : null].filter(Boolean)
    return list.length ? ` · ${list.join(" · ")}` : ""
}

/** Média (efetivo, com a tabela na dica). */
function AverageKpi({ label, pair, basis }: { label: string; pair: RoutineMoneyPair; basis: string }) {
    return <KpiCard label={label} value={pair.effectiveUsd} formatter={usd} hint={`Efetivo · tabela ${formatUsd(pair.listUsd)}`} footer={`${brlLine(pair.effectiveBrl)} · ${basis}`} />
}

/**
 * KPIs de custo da Visão geral (OPE-203): custo de tabela (pago por uso), custo efetivo (pelo plano da chave),
 * economia e as médias por execução, por dia corrido e por dia com execução, em US$ com o R$ (PTAX do dia).
 */
export function RoutineCostKpis({ cost }: { cost: RoutineCostKpisDto }) {
    const totals = cost.totals
    return (
        <>
            <KpiCard label="Custo de tabela" value={totals.listUsd} formatter={usd} hint={`Quanto custaria pago por uso${marks(totals)}`} footer={brlLine(totals.listBrl)} />
            <KpiCard label="Custo efetivo" value={totals.effectiveUsd} formatter={usd} hint={`Pelo plano da chave que respondeu${marks(totals)}`} footer={brlLine(totals.effectiveBrl)} />
            <KpiCard label="Economia" value={totals.savingsUsd} formatter={usd} hint="Custo de tabela − custo efetivo" footer={brlLine(totals.savingsBrl)} />
            <AverageKpi label="Média por execução" pair={cost.perRun} basis={`${cost.runsWithCost} execução(ões)`} />
            <AverageKpi label="Média por dia" pair={cost.perCalendarDay} basis={`${cost.calendarDays} dia(s) corrido(s)`} />
            <AverageKpi label="Média por dia ativo" pair={cost.perActiveDay} basis={`${cost.activeDays} dia(s) com execução`} />
        </>
    )
}
