"use client"

import { UsageBar } from "@/components/metrics/UsageBar"
import { formatResetIn } from "../../logic"
import { formatGoDateTime, formatGoPercent } from "../../go-logic"
import type { GoMeterDto } from "../../go-types"
import { GO_WINDOWS_GRID } from "./layout"

/** As três janelas da assinatura (5h, semanal, mensal): % com uma casa e o tempo até o reset (`UsageBar`). */
export function GoUsageWindows({ meters, now }: { meters: readonly GoMeterDto[]; now: number }) {
    return (
        <div className={GO_WINDOWS_GRID}>
            {meters.map((meter) => {
                const resetIn = meter.resetsAt ? formatResetIn(meter.resetsAt, now) : null
                return (
                    <UsageBar
                        key={meter.id}
                        label={meter.label}
                        percent={meter.percent}
                        fractionDigits={1}
                        ariaLabel={`OpenCode Go ${meter.label}: ${formatGoPercent(meter.percent)} usado${resetIn ? `, reinicia em ${resetIn}` : ""}`}
                        detail={resetIn}
                        detailTitle={meter.resetsAt ? `Reinicia em ${formatGoDateTime(meter.resetsAt)}` : undefined}
                        dataAttributes={{ "data-go-window": meter.id }}
                    />
                )
            })}
        </div>
    )
}
