"use client"

import { Clock, Wallet } from "lucide-react"
import { AnimatedNumber } from "@/components/motion/AnimatedNumber"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatNumberBR } from "@/lib/format"
import { formatHoursLabel } from "@/features/orcamentos/logic"
import type { ClienteTaskEstimateDto } from "@/features/orcamentos/types"

/**
 * Estimativa na visão do cliente (coluna lateral, somente leitura): o **prazo inflado** (`H × fator`)
 * e o faturamento. As horas reais não são exibidas nem retornadas pelo servidor.
 */
export function ClienteEstimateCard({ estimate }: { estimate: ClienteTaskEstimateDto | null }) {
    if (!estimate) return null
    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Estimativa</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-0 text-sm">
                <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" aria-hidden /> Prazo
                    </span>
                    <span className="font-mono font-medium">
                        <AnimatedNumber value={estimate.clientHours} formatter={(value) => `${formatHoursLabel(value)} h`} />
                    </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Wallet className="h-3.5 w-3.5" aria-hidden /> Faturamento estimado
                    </span>
                    <span className="font-mono font-medium">
                        <AnimatedNumber value={estimate.billingBrl} formatter={(value) => `R$ ${formatNumberBR(value)}`} />
                    </span>
                </div>
            </CardContent>
        </Card>
    )
}
