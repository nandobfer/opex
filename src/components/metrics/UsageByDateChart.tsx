"use client"

import { BarsChart } from "./charts/BarsChart"
import { EmptyChart } from "./charts/EmptyChart"
import { formatBucketLabel } from "./format"
import { CHART_HEIGHT } from "./layout"

const CONFIG = {
    runs: { label: "Execuções", color: "var(--chart-1)" },
    failures: { label: "Falhas", color: "var(--chart-4)" },
}

/** Gráfico **Uso por data**: execuções (e falhas) do agente por dia, semana ou mês. */
export function UsageByDateChart({ points, unit, height = CHART_HEIGHT }: { points: readonly { bucket: string; runs: number; failures: number }[]; unit: string; /** Altura da área do gráfico (padrão das Visões gerais). */ height?: number }) {
    if (!points.some((point) => point.runs > 0)) return <EmptyChart message="Nenhum uso no período." />
    return (
        <BarsChart
            data={points}
            xKey="bucket"
            series={[
                { key: "runs", label: `Execuções (${unit})`, color: CONFIG.runs.color },
                { key: "failures", label: "Falhas", color: CONFIG.failures.color },
            ]}
            config={CONFIG}
            ariaLabel="Uso por data"
            height={height}
            xTickFormatter={formatBucketLabel}
            valueFormatter={(value) => Math.round(value).toLocaleString("pt-BR")}
            table={{
                columns: [
                    { key: "bucket", label: "Data" },
                    { key: "runs", label: "Execuções" },
                    { key: "failures", label: "Falhas" },
                ],
                rows: points.map((point) => ({ ...point, bucket: formatBucketLabel(point.bucket) })),
            }}
        />
    )
}
