"use client"

import { UsageBars } from "@/components/metrics/UsageBars"
import { EMPTY_USAGE, environmentUsage } from "../../resource-usage"
import type { ServiceStatusDto } from "../../types"
import type { UsageContext } from "./ContainerList"
import { ENV_USAGE_GRID_CLASS, ENV_USAGE_SUMMARY_CLASS } from "./environment-card-layout"
import { usageBarsItems } from "./usage-items"

/** Faixa "Uso do ambiente" do card do dono: a soma dos containers (só com containers). */
export function EnvironmentUsageSummary({ services, context }: { services: ServiceStatusDto[]; context: UsageContext }) {
    if (!services.length) return null
    const inputs = services.map((item) => ({ running: item.state === "running", usage: item.usage ?? EMPTY_USAGE, limits: item.limits }))
    const set = environmentUsage(inputs, context.capacity)
    const checkedAt = services.map((item) => item.usage?.diskCheckedAt ?? null).find(Boolean) ?? null
    return (
        <section aria-label="Uso do ambiente" className={ENV_USAGE_SUMMARY_CLASS} data-testid="environment-usage-summary">
            <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Uso do ambiente</h3>
            <UsageBars items={usageBarsItems(set, context.machine, { scope: "ambiente", diskCheckedAt: checkedAt })} className={ENV_USAGE_GRID_CLASS} />
        </section>
    )
}
