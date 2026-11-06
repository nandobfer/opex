"use client"

import { UsageBar } from "@/components/metrics/UsageBar"
import { formatBytes, hasSwap } from "../logic"
import type { HostMetrics, HostUsage } from "../schemas"
import { HOST_ROWS_CLASS } from "./host-metrics-layout"

const usedOfTotal = (item: HostUsage) => `${formatBytes(item.used)} / ${formatBytes(item.total)}`
const percentText = (item: HostUsage) => `${Math.round(item.percent)}% usado`

/** As quatro linhas do bloco Servidor, nesta ordem: CPU (só %), RAM, Swap ("Sem swap" sem swap) e Disco. */
export function HostMetricsRows({ metrics }: { metrics: HostMetrics }) {
    return (
        <div className={HOST_ROWS_CLASS}>
            <UsageBar label="CPU" percent={metrics.cpu.percent} ariaLabel={`CPU: ${percentText(metrics.cpu)}`} dataAttributes={{ "data-host-metric": "cpu" }} />
            <UsageBar label="RAM" percent={metrics.memory.percent} detail={usedOfTotal(metrics.memory)} ariaLabel={`RAM: ${percentText(metrics.memory)} (${usedOfTotal(metrics.memory)})`} dataAttributes={{ "data-host-metric": "memory" }} />
            {hasSwap(metrics) ? (
                <UsageBar label="Swap" percent={metrics.swap.percent} detail={usedOfTotal(metrics.swap)} ariaLabel={`Swap: ${percentText(metrics.swap)} (${usedOfTotal(metrics.swap)})`} dataAttributes={{ "data-host-metric": "swap" }} />
            ) : (
                <div className="flex items-center justify-between gap-2 text-[11px]" data-host-metric="swap">
                    <span className="truncate text-muted-foreground">Swap</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">Sem swap</span>
                </div>
            )}
            <UsageBar label="Disco" percent={metrics.disk.percent} detail={usedOfTotal(metrics.disk)} ariaLabel={`Disco: ${percentText(metrics.disk)} (${usedOfTotal(metrics.disk)})`} dataAttributes={{ "data-host-metric": "disk" }} />
        </div>
    )
}
