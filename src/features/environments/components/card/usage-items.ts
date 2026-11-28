import type { UsageBarsItem } from "@/components/metrics/UsageBars"
import { USAGE_EMPTY_TEXT, USAGE_METRICS, usageDetail, type UsageSet } from "../../resource-usage"
import type { Machine } from "../../schemas"

/** As quatro linhas (CPU, RAM, Swap, Disco) de um uso, prontas para a `UsageBars`. */
export function usageBarsItems(set: UsageSet, machine: Machine, options: { scope: string; diskCheckedAt?: string | null }): UsageBarsItem[] {
    return USAGE_METRICS.map(({ metric, label }) => {
        const cell = set[metric]
        const dataAttributes = { "data-usage-metric": metric } as const
        if (cell.kind === "empty") return { key: metric, label, emptyText: USAGE_EMPTY_TEXT[cell.reason], dataAttributes }
        const detail = usageDetail(metric, cell.value, machine)
        const checked = metric === "disk" && options.diskCheckedAt ? ` · lido às ${new Date(options.diskCheckedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""
        return { key: metric, label, percent: cell.value.percent, detail, detailTitle: `${detail}${checked}`, ariaLabel: `${label} de ${options.scope}: ${Math.round(cell.value.percent)}% (${detail})`, dataAttributes }
    })
}
