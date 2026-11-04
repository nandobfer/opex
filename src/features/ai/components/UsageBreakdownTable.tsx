"use client"

import { AnimatedNumber } from "@/components/motion/AnimatedNumber"
import { formatTokens, formatTokensCompact, formatUsd, type ProviderUsageRow, type ProviderUsageTotals } from "../provider-usage"

const HEADER = "p-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
const CELL = "p-2 align-middle"

/** Uma linha de consumo: um recurso (origem ou feature de IA) no período consultado. */
export type UsageBreakdownRow = ProviderUsageRow

export type UsageBreakdownTotals = ProviderUsageTotals

interface UsageBreakdownTableProps {
    firstColumnLabel: string
    rows: UsageBreakdownRow[]
    total: UsageBreakdownTotals
    /** Provedores que não informam custo escondem a coluna (só tokens são medidos). */
    showCost?: boolean
}

function Tokens({ value }: { value: number | null }) {
    return value === null
        ? <span className="text-muted-foreground" title="Métrica não informada">—</span>
        // O número completo fica no title; a célula mostra a forma abreviada.
        : <span title={formatTokens(value)}><AnimatedNumber value={value} formatter={formatTokensCompact} duration={0.2} /></span>
}

function Cost({ value }: { value: number | null }) {
    return value === null ? <span className="text-muted-foreground" title="Métrica não informada">—</span> : <AnimatedNumber value={value} formatter={formatUsd} duration={0.2} />
}

function Row({ label, row, bold, showCost }: { label: string; row: UsageBreakdownTotals; bold?: boolean; showCost: boolean }) {
    return (
        <tr className={bold ? "border-t bg-muted/30 font-semibold" : "border-t"}>
            <td className={CELL}>{label}</td>
            <td className={`${CELL} tabular-nums`}>{row.requests.toLocaleString("pt-BR")}</td>
            <td className={`${CELL} tabular-nums`}><Tokens value={row.inputTokens} /></td>
            <td className={`${CELL} tabular-nums`}><Tokens value={row.outputTokens} /></td>
            <td className={`${CELL} tabular-nums`}><Tokens value={row.totalTokens} /></td>
            {showCost && <td className={`${CELL} tabular-nums`}><Cost value={row.costUsd} /></td>}
        </tr>
    )
}

/**
 * Tabela de consumo segmentada por recurso, usada pelos painéis do OpenCode (origem), do JEV e
 * dos provedores diretos (feature de IA ou agente). Métricas desconhecidas aparecem como `—`,
 * nunca como zero; os tokens são abreviados com o número completo no `title`.
 */
export function UsageBreakdownTable({ firstColumnLabel, rows, total, showCost = true }: UsageBreakdownTableProps) {
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr>
                        <th className={HEADER}>{firstColumnLabel}</th>
                        <th className={HEADER}>Chamadas</th>
                        <th className={HEADER}>Entrada</th>
                        <th className={HEADER}>Saída</th>
                        <th className={HEADER}>Total</th>
                        {showCost && <th className={HEADER}>Custo (USD)</th>}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => <Row key={row.key} label={row.label} row={row} showCost={showCost} />)}
                    <Row label="Total" row={total} bold showCost={showCost} />
                </tbody>
            </table>
        </div>
    )
}
