"use client"

import { Clock } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatNumberBR } from "@/lib/format"
import { formatHoursLabel } from "@/features/orcamentos/logic"
import type { TaskEstimate } from "../types"

const chip = "inline-flex shrink-0 items-center gap-1 rounded border border-sky-400/30 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium leading-none text-sky-300"

/**
 * Estimativa/orçamento da tarefa. `internal` mostra as horas reais (H); `client` mostra as horas
 * do cliente (H × fator) e o faturamento em reais.
 */
export function EstimateBadge({ estimate, mode = "internal" }: { estimate: TaskEstimate | null; mode?: "internal" | "client" }) {
    if (!estimate) return null
    if (mode === "internal") {
        return (
            <span className={cn(chip)} title="Estimativa real de horas">
                <Clock className="h-3 w-3" aria-hidden /> {formatHoursLabel(estimate.hours)} h
            </span>
        )
    }
    return (
        <span className={cn(chip)} title={`Estimativa ao cliente · faturamento R$ ${formatNumberBR(estimate.billingBrl)}`}>
            <Clock className="h-3 w-3" aria-hidden /> {formatHoursLabel(estimate.clientHours)} h · R$ {formatNumberBR(estimate.billingBrl)}
        </span>
    )
}
