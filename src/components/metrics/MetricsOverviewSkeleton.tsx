"use client"

import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { CHART_GRID, CHART_HEIGHT, KPI_CARD_HEIGHT, KPI_GRID } from "./layout"

/** Esqueleto da Visão geral (mesma grade dos KPIs e dos gráficos). */
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
                    <Skeleton key={index} className="w-full" style={{ height: CHART_HEIGHT + 96 }} />
                ))}
            </div>
        </div>
    )
}
