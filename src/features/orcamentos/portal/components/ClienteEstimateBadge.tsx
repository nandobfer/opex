"use client"

import { Clock } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatNumberBR } from "@/lib/format"
import { formatHoursLabel } from "@/features/orcamentos/logic"
import type { ClienteTaskEstimateDto } from "@/features/orcamentos/types"

const chip = "inline-flex shrink-0 items-center gap-1 rounded border border-sky-400/30 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium leading-none text-sky-300"

/**
 * Estimativa na visão do cliente: só o **tempo inflado** (`H × fator`) e o faturamento. Nunca as
 * horas reais, o fator, o custo/hora ou o modelo (a visão interna usa o `EstimateBadge`).
 */
export function ClienteEstimateBadge({ estimate }: { estimate: ClienteTaskEstimateDto | null }) {
    if (!estimate) return null
    return (
        <span className={cn(chip)} title={`Estimativa · faturamento R$ ${formatNumberBR(estimate.billingBrl)}`}>
            <Clock className="h-3 w-3" aria-hidden /> {formatHoursLabel(estimate.clientHours)} h · R$ {formatNumberBR(estimate.billingBrl)}
        </span>
    )
}
