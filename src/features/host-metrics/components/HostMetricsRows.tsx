"use client"

import { UsageBars, type UsageBarsItem } from "@/components/metrics/UsageBars"
import { formatBytes, hasSwap } from "../logic"
import type { HostMetrics, HostUsage } from "../schemas"
import { HOST_ROWS_CLASS } from "./host-metrics-layout"

const usedOfTotal = (item: HostUsage) => `${formatBytes(item.used)} / ${formatBytes(item.total)}`
const percentText = (item: HostUsage) => `${Math.round(item.percent)}% usado`

/** As quatro linhas do bloco Servidor, nesta ordem: CPU (só %), RAM, Swap ("Sem swap" sem swap) e Disco. */
export function HostMetricsRows({ metrics }: { metrics: HostMetrics }) {
    const items: UsageBarsItem[] = [
        { key: "cpu", label: "CPU", percent: metrics.cpu.percent, ariaLabel: `CPU: ${percentText(metrics.cpu)}`, dataAttributes: { "data-host-metric": "cpu" } },
        { key: "memory", label: "RAM", percent: metrics.memory.percent, detail: usedOfTotal(metrics.memory), ariaLabel: `RAM: ${percentText(metrics.memory)} (${usedOfTotal(metrics.memory)})`, dataAttributes: { "data-host-metric": "memory" } },
        hasSwap(metrics)
            ? { key: "swap", label: "Swap", percent: metrics.swap.percent, detail: usedOfTotal(metrics.swap), ariaLabel: `Swap: ${percentText(metrics.swap)} (${usedOfTotal(metrics.swap)})`, dataAttributes: { "data-host-metric": "swap" } }
            : { key: "swap", label: "Swap", emptyText: "Sem swap", dataAttributes: { "data-host-metric": "swap" } },
        { key: "disk", label: "Disco", percent: metrics.disk.percent, detail: usedOfTotal(metrics.disk), ariaLabel: `Disco: ${percentText(metrics.disk)} (${usedOfTotal(metrics.disk)})`, dataAttributes: { "data-host-metric": "disk" } },
    ]
    return <UsageBars items={items} className={HOST_ROWS_CLASS} />
}
