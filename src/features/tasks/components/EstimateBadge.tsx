"use client"

import { Clock, Wallet } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatNumberBR } from "@/lib/format"
import { formatHoursLabel } from "@/features/orcamentos/logic"
import type { TaskEstimate } from "../types"

const chip = "inline-flex shrink-0 items-center gap-1 rounded border border-sky-400/30 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium leading-none text-sky-300"
const billingChip = "inline-flex shrink-0 items-center gap-1 rounded border border-success/30 bg-success/10 px-1.5 py-0.5 text-[10px] font-medium leading-none text-success"

/**
 * Estimativa/orçamento da tarefa. `internal` mostra as horas reais (H) e, **havendo custo/hora**
 * (cliente), o faturamento estimado (`custo/hora × H × fator`); `client` mostra as horas do cliente
 * (H × fator) e o faturamento em reais.
 */
export function EstimateBadge({ estimate, mode = "internal" }: { estimate: TaskEstimate | null; mode?: "internal" | "client" }) {
    if (!estimate) return null
    if (mode === "internal") {
        return (
            <>
                <span className={cn(chip)} title="Estimativa real de horas">
                    <Clock className="h-3 w-3" aria-hidden /> {formatHoursLabel(estimate.hours)} h
                </span>
                {estimate.hourlyRate > 0 && (
                    <span className={cn(billingChip)} title={`Faturamento estimado · custo/hora R$ ${formatNumberBR(estimate.hourlyRate)} × ${formatHoursLabel(estimate.hours)} h × fator ${estimate.factor}`}>
                        <Wallet className="h-3 w-3" aria-hidden /> R$ {formatNumberBR(estimate.billingBrl)}
                    </span>
                )}
            </>
        )
    }
    return (
        <span className={cn(chip)} title={`Estimativa ao cliente · faturamento R$ ${formatNumberBR(estimate.billingBrl)}`}>
            <Clock className="h-3 w-3" aria-hidden /> {formatHoursLabel(estimate.clientHours)} h · R$ {formatNumberBR(estimate.billingBrl)}
        </span>
    )
}
