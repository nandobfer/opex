"use client"

import { UsageBar } from "@/components/metrics/UsageBar"
import { formatResetIn } from "@/features/opencode-quota/logic"
import { formatUsageDateTime, formatUsagePercent } from "../cycle-logic"
import type { UsageMeterDto } from "../types"
import { USAGE_WINDOWS_GRID } from "./layout"

/** As janelas da assinatura (5h, semanal, mensal): % com uma casa e o tempo até o reset (`UsageBar`). */
export function UsageWindows({ meters, now, subject }: { meters: readonly UsageMeterDto[]; now: number; /** Nome da assinatura no rótulo acessível. */ subject: string }) {
    return (
        <div className={USAGE_WINDOWS_GRID}>
            {meters.map((meter) => {
                const resetIn = meter.resetsAt ? formatResetIn(meter.resetsAt, now) : null
                return (
                    <UsageBar
                        key={meter.id}
                        label={meter.label}
                        percent={meter.percent}
                        fractionDigits={1}
                        ariaLabel={`${subject} ${meter.label}: ${formatUsagePercent(meter.percent)} usado${resetIn ? `, reinicia em ${resetIn}` : ""}`}
                        detail={resetIn}
                        detailTitle={meter.resetsAt ? `Reinicia em ${formatUsageDateTime(meter.resetsAt)}` : undefined}
                        dataAttributes={{ "data-usage-window": meter.id }}
                    />
                )
            })}
        </div>
    )
}
