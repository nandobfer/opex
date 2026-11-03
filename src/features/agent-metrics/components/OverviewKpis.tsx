"use client"

import { format } from "date-fns"
import { KpiCard, KpiGrid } from "@/components/metrics/KpiCard"
import { LastUsedKpi } from "@/components/metrics/LastUsedKpi"
import { formatDataSince } from "@/components/metrics/DataSinceNotice"
import { formatMetricValue } from "@/components/metrics/format"
import type { MetricKpiDto } from "../types"

function footerOf(item: MetricKpiDto): string | null {
    if (item.since) return formatDataSince(item.since)
    if (item.approximateUntil) return `Aproximado antes de ${format(new Date(item.approximateUntil), "dd/MM/yyyy")}`
    return null
}

/** KPIs da Visão geral: Último uso (ignora o período) e os indicadores do agente. */
export function OverviewKpis({ lastUsedAt, kpis }: { lastUsedAt: string | null; kpis: readonly MetricKpiDto[] }) {
    return (
        <KpiGrid>
            <LastUsedKpi at={lastUsedAt} />
            {kpis.map((item) => (
                <KpiCard key={item.id} label={item.label} hint={item.hint} value={item.value} formatter={(value) => formatMetricValue(value, item.format)} footer={footerOf(item)} />
            ))}
        </KpiGrid>
    )
}
