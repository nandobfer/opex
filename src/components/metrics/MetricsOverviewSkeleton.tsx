"use client"

import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { CHART_CARD_CHROME, CHART_GRID, CHART_HEIGHT, KPI_CARD_HEIGHT, KPI_GRID, LINE_CHART_CARD_CHROME } from "./layout"

/**
 * Esqueleto da Visão geral (mesma grade dos KPIs e dos gráficos): o primeiro cartão é o gráfico de
 * linhas, na largura toda e com o eixo do n e a linha de explicação da amostra.
 */
export function MetricsOverviewSkeleton({ kpis = 6, charts = 3 }: { kpis?: number; charts?: number }) {
    return (
        <div className="space-y-4" aria-label="Carregando a visão geral">
            <div className={KPI_GRID}>
                {Array.from({ length: kpis }, (_, index) => (
                    <Skeleton key={index} className={cn(KPI_CARD_HEIGHT, "w-full")} />
                ))}
            </div>
            <div className={CHART_GRID}>
                {Array.from({ length: charts }, (_, index) => (
                    <Skeleton key={index} className={cn("w-full", index === 0 && "lg:col-span-2")} style={{ height: CHART_HEIGHT + (index === 0 ? LINE_CHART_CARD_CHROME : CHART_CARD_CHROME) }} data-chart-skeleton={index === 0 ? "lines" : "chart"} />
                ))}
            </div>
        </div>
    )
}
